import type {
  ArchitecturalGap,
  DetectedService,
  Evidence,
  RepoSnapshot,
  SessionLevel,
  StackFingerprint,
} from "../types.js";

export interface DiagnosticsInput {
  snapshot: RepoSnapshot;
  manifestScan: ManifestScanLike;
  iacScan: IacScanLike;
}

export interface ManifestScanLike {
  services: DetectedService[];
  frameworks: string[];
  warnings: string[];
}

export interface IacScanLike {
  iac: string[];
  compute: string[];
  services: DetectedService[];
  observability: {
    xray: boolean;
    openTelemetry: boolean;
    cloudwatchAlarms: boolean;
    structuredLogging: boolean;
  };
  docker: { present: boolean; baseImages: string[]; multiStage: boolean };
  filesConsidered: string[];
  warnings: string[];
}

const ADVANCED_IAC = new Set(["terraform", "cdk", "serverless", "sst"]);

function dedupeServices(list: DetectedService[]): DetectedService[] {
  const merged = new Map<string, DetectedService>();
  for (const service of list) {
    const existing = merged.get(service.service);
    if (!existing) {
      merged.set(service.service, { ...service, sources: [...service.sources] });
      continue;
    }
    for (const source of service.sources) {
      if (!existing.sources.some((entry) => entry.path === source.path)) existing.sources.push(source);
    }
    if (service.confidence === "high") existing.confidence = "high";
  }
  return [...merged.values()].sort((left, right) => left.service.localeCompare(right.service));
}

/**
 * Choose a re:Invent level from what the repo actually contains.
 *
 * Plain application code is a 200. Real service usage is a 300. Advanced IaC
 * across several services is where 400 and 500 talks start to pay off.
 */
export function recommendLevel(
  services: DetectedService[],
  iac: string[],
  compute: string[],
): SessionLevel {
  const advancedIac = iac.filter((kind) => ADVANCED_IAC.has(kind)).length;
  const strongServices = services.filter((service) => service.confidence !== "low").length;
  const multipleComputes = compute.filter((kind) => kind !== "unknown").length > 1;

  if (advancedIac >= 2 && strongServices >= 3) return 500;
  if (advancedIac >= 1 && strongServices >= 3) return 400;
  if (strongServices >= 3 || multipleComputes) return 400;
  if (strongServices >= 1 || advancedIac >= 1) return 300;
  return 200;
}

export function buildFingerprint(input: DiagnosticsInput): StackFingerprint {
  const { snapshot, manifestScan, iacScan } = input;
  const services = dedupeServices([...manifestScan.services, ...iacScan.services]);
  const compute = [...new Set([...iacScan.compute])].filter(
    (kind): kind is "lambda" | "ecs" | "eks" | "ec2" | "apprunner" | "unknown" =>
      kind === "lambda" || kind === "ecs" || kind === "eks" || kind === "ec2" || kind === "apprunner" || kind === "unknown",
  );
  const iac = iacScan.iac.filter(
    (kind): kind is "terraform" | "cdk" | "serverless" | "sst" | "none" =>
      kind === "terraform" || kind === "cdk" || kind === "serverless" || kind === "sst" || kind === "none",
  );
  const hasMcpConfig =
    Object.keys(snapshot.manifests).some((path) => path.toLowerCase().endsWith("mcp.json")) ||
    manifestScan.frameworks.includes("Model Context Protocol");

  const warnings = [...manifestScan.warnings, ...iacScan.warnings];
  if (snapshot.truncated) {
    warnings.push(
      `only ${snapshot.fetchedFiles} files were read; the scan is partial and gaps are ranked against that subset`,
    );
  }

  return {
    repo: snapshot.ref,
    scannedAt: new Date().toISOString(),
    languages: snapshot.languages,
    services,
    frameworks: manifestScan.frameworks,
    compute: compute.length === 0 ? ["unknown"] : compute,
    iac: iac.length === 0 ? ["none"] : iac,
    hasMcpConfig,
    hasDocker: iacScan.docker.present,
    recommendedLevel: recommendLevel(services, iacScan.iac, iacScan.compute),
    warnings,
  };
}

interface GapContext {
  fingerprint: StackFingerprint;
  iacScan: IacScanLike;
  snapshot: RepoSnapshot;
  wildcardIam: { wildcard: boolean; files: string[] };
  hasWebFramework: boolean;
}

function hasService(fingerprint: StackFingerprint, name: string): boolean {
  return fingerprint.services.some((service) => service.service === name);
}

function sourcesFor(fingerprint: StackFingerprint, names: string[]): Evidence[] {
  const evidence: Evidence[] = [];
  for (const service of fingerprint.services) {
    if (!names.includes(service.service)) continue;
    for (const source of service.sources) {
      evidence.push({
        label: `${service.service} in ${source.path}${source.detail ? ` (${source.detail})` : ""}`,
        paths: [source.path],
      });
    }
  }
  return evidence;
}

function uniqEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of evidence) {
    const key = `${item.label}|${item.paths.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function hasAnyCompute(fingerprint: StackFingerprint): boolean {
  return fingerprint.compute.some((kind) => kind === "lambda" || kind === "ecs" || kind === "eks");
}

/**
 * Diagnose architecture gaps from what the scan actually read.
 *
 * Every gap carries evidence pointing at real files. If the repo is too thin to
 * support a claim, no gap is emitted: a vacant "you forgot observability" on a
 * repo with three files is noise, not insight.
 */
export function diagnose(context: GapContext): ArchitecturalGap[] {
  const { fingerprint, iacScan, wildcardIam, hasWebFramework } = context;
  const gaps: ArchitecturalGap[] = [];
  const obs = iacScan.observability;

  const agentic = fingerprint.hasMcpConfig || hasService(fingerprint, "Bedrock");
  const hasOrchestration = hasService(fingerprint, "Step Functions");
  if (agentic && !hasOrchestration) {
    gaps.push({
      id: "agent-without-orchestration",
      title: "Agent stack with no orchestration layer",
      why: "MCP or Bedrock usage was found, but nothing coordinates multi-step runs or holds partial failure. A retry that re-runs a whole agent is the usual result.",
      severity: "high",
      evidence: uniqEvidence([
        ...sourcesFor(fingerprint, ["Bedrock"]),
        ...(fingerprint.hasMcpConfig
          ? [{ label: "MCP configuration or SDK present", paths: mcpPaths(context.snapshot) }]
          : []),
      ]),
      taggedServices: ["Bedrock", "Step Functions"],
      searchTopics: ["Agentic AI", "Serverless", "MCP"],
      targetLevel: 400,
    });
  }

  if (fingerprint.services.some((service) => service.service === "DynamoDB")) {
    // Configuration keys, not prose: a comment saying "no Streams consumer"
    // must not count as proof that Streams exist. The earlier bare "Stream"
    // needle matched exactly that and hid a real gap.
    const hasStreams = manifestMentions(context.snapshot, [
      "stream_view_type",
      "streamViewType",
      "streamSpecification",
      "streamEnabled",
      "dynamodb-streams",
      "dynamodbv2.Stream",
      "StreamViewType",
    ]);
    const hasDax = manifestMentions(context.snapshot, ["aws_dax_cluster", "AmazonDaxClient", "aws-dax", "@aws-sdk/client-dax"]);
    const hasDlq = manifestMentions(context.snapshot, [
      "dead_letter_config",
      "deadLetterConfig",
      "DeadLetterConfig",
      "dead_letter_target_arn",
      "deadLetterTargetArn",
      "aws_sqs_queue_policy",
      "redrive_policy",
    ]);
    if (!hasStreams && !hasDax && !hasDlq) {
      gaps.push({
        id: "dynamodb-without-resilience",
        title: "DynamoDB with no Streams, DAX or dead-letter queue",
        why: "Writes fail and nothing captures them. There is no change feed to react to and no queue to hold a poisoned message.",
        severity: "high",
        evidence: uniqEvidence(sourcesFor(fingerprint, ["DynamoDB"])),
        taggedServices: ["DynamoDB", "SQS"],
        searchTopics: ["DynamoDB", "Serverless"],
        targetLevel: 300,
      });
    }
  }

  if (hasAnyCompute(fingerprint) && !obs.openTelemetry) {
    gaps.push({
      id: "compute-without-observability",
      title: "Compute with no OpenTelemetry tracing",
      why: "Lambda or container workloads were detected with no OpenTelemetry signal. Cross-service failures will be traced by hand, if at all.",
      severity: "high",
      evidence: uniqEvidence(sourcesFor(fingerprint, ["Lambda", "ECS", "EKS"])),
      taggedServices: ["CloudWatch", "X-Ray"],
      searchTopics: ["Observability", "Serverless", "EKS"],
      targetLevel: 300,
    });
  }

  const serviceCount = fingerprint.services.length;
  const hasQueue = hasService(fingerprint, "SQS") || hasService(fingerprint, "SNS");
  if (serviceCount >= 3 && !hasQueue) {
    gaps.push({
      id: "no-queue-isolation",
      title: "Multi-service system with no queue-per-service isolation",
      why: "Several services are wired together with no queue between them, so one slow consumer can stall everything behind it.",
      severity: "medium",
      evidence: uniqEvidence(sourcesFor(fingerprint, ["Lambda", "ECS", "DynamoDB", "Bedrock"])),
      taggedServices: ["SQS", "SNS"],
      searchTopics: ["Serverless", "Observability"],
      targetLevel: 300,
    });
  }

  if (hasWebFramework) {
    const hasWaf = hasService(fingerprint, "WAF") || manifestMentions(context.snapshot, ["wafv2", "aws_wafv2_web_acl", "wafv2.CfnWebACL"]);
    if (!hasWaf) {
      gaps.push({
        id: "public-api-without-waf",
        title: "Public API surface with no WAF or rate limiting",
        why: "A web framework is exposed, and nothing in the infrastructure declares a WAF or a throttle, so the API is open to a cheap flood.",
        severity: "medium",
        evidence: uniqEvidence([
          ...sourcesFor(fingerprint, ["API Gateway"]),
          { label: "Web framework dependency in a manifest", paths: webFrameworkPaths(context.snapshot) },
        ]),
        taggedServices: ["WAF", "API Gateway"],
        searchTopics: ["Security", "Serverless"],
        targetLevel: 300,
      });
    }
  }

  if (hasService(fingerprint, "IAM") && wildcardIam.wildcard) {
    gaps.push({
      id: "wildcard-iam",
      title: "IAM policies granting a wildcard action",
      why: 'An IAM policy declares `Action: "*"`. Every service it covers is reachable by anything that assumes the role.',
      severity: "high",
      evidence: wildcardIam.files.map((path) => ({ label: 'wildcard Action in a policy body', paths: [path] })),
      taggedServices: ["IAM"],
      searchTopics: ["Security"],
      targetLevel: 400,
    });
  }

  if (gaps.length === 0 && fingerprint.services.length === 0) {
    return [];
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  gaps.sort((left, right) => {
    if (order[left.severity] !== order[right.severity]) return order[left.severity] - order[right.severity];
    return left.id.localeCompare(right.id);
  });
  return gaps;
}

function mcpPaths(snapshot: RepoSnapshot): string[] {
  const paths = Object.keys(snapshot.manifests).filter((path) => path.toLowerCase().endsWith("mcp.json"));
  return paths.length > 0 ? paths : Object.keys(snapshot.manifests).slice(0, 1);
}

function webFrameworkPaths(snapshot: RepoSnapshot): string[] {
  const names = ["express", "fastify", "next", "@nestjs/core", "fastapi", "django", "flask", "gin", "axum"];
  const paths: string[] = [];
  for (const [path, body] of Object.entries(snapshot.manifests)) {
    const lower = body.toLowerCase();
    if (names.some((name) => lower.includes(name))) paths.push(path);
  }
  return paths.length > 0 ? paths : Object.keys(snapshot.manifests).slice(0, 1);
}

function manifestMentions(snapshot: RepoSnapshot, needles: string[]): boolean {
  for (const body of Object.values(snapshot.manifests)) {
    if (needles.some((needle) => body.includes(needle))) return true;
  }
  return false;
}
