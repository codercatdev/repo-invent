import type { DetectedService, RepoSnapshot, SignalSource } from "../types.js";

interface ServicePattern {
  service: string;
  confidence: DetectedService["confidence"];
  matches: (text: string) => boolean;
}

function has(text: string, needle: string): boolean {
  return text.includes(needle);
}

function anyOf(needles: string[]): (text: string) => boolean {
  return (text) => needles.some((needle) => has(text, needle));
}

/**
 * Names the SDK packages and module paths carry, mapped to the service they
 * mean. Matching literal package names rather than "AWS" keeps a comment that
 * mentions S3 from being read as an S3 integration.
 */
const JS_CLIENT_PATTERNS: ServicePattern[] = [
  { service: "DynamoDB", confidence: "high", matches: anyOf(["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"]) },
  { service: "S3", confidence: "high", matches: anyOf(["@aws-sdk/client-s3"]) },
  { service: "Lambda", confidence: "high", matches: anyOf(["@aws-sdk/client-lambda"]) },
  { service: "SQS", confidence: "high", matches: anyOf(["@aws-sdk/client-sqs"]) },
  { service: "SNS", confidence: "high", matches: anyOf(["@aws-sdk/client-sns"]) },
  { service: "Step Functions", confidence: "high", matches: anyOf(["@aws-sdk/client-sfn"]) },
  { service: "Bedrock", confidence: "high", matches: anyOf(["@aws-sdk/client-bedrock-runtime", "@aws-sdk/client-bedrock"]) },
  { service: "EKS", confidence: "high", matches: anyOf(["@aws-sdk/client-eks", "@aws-sdk/client-eks-auth"]) },
  { service: "ECS", confidence: "high", matches: anyOf(["@aws-sdk/client-ecs"]) },
  { service: "CloudWatch", confidence: "high", matches: anyOf(["@aws-sdk/client-cloudwatch", "@aws-sdk/client-cloudwatch-logs"]) },
  { service: "X-Ray", confidence: "high", matches: anyOf(["@aws-sdk/client-xray", "aws-xray-sdk"]) },
  { service: "API Gateway", confidence: "high", matches: anyOf(["@aws-sdk/client-apigateway", "@aws-sdk/client-apigatewayv2"]) },
  { service: "Kinesis", confidence: "high", matches: anyOf(["@aws-sdk/client-kinesis"]) },
  { service: "Secrets Manager", confidence: "high", matches: anyOf(["@aws-sdk/client-secrets-manager"]) },
  { service: "Cognito", confidence: "high", matches: anyOf(["@aws-sdk/client-cognito-identity-provider", "amazon-cognito-identity-js"]) },
  { service: "IAM", confidence: "medium", matches: anyOf(["@aws-sdk/client-iam"]) },
];

const PY_SERVICE_PATTERNS: ServicePattern[] = [
  { service: "DynamoDB", confidence: "high", matches: anyOf(["boto3.resource('dynamodb')", 'boto3.resource("dynamodb")', "boto3.client('dynamodb')", 'boto3.client("dynamodb")']) },
  { service: "S3", confidence: "high", matches: anyOf(["boto3.client('s3')", 'boto3.client("s3")', "boto3.resource('s3')"]) },
  { service: "Lambda", confidence: "high", matches: anyOf(["boto3.client('lambda')", 'boto3.client("lambda")']) },
  { service: "SQS", confidence: "high", matches: anyOf(["boto3.client('sqs')", 'boto3.client("sqs")', "boto3.resource('sqs')"]) },
  { service: "Step Functions", confidence: "high", matches: anyOf(["boto3.client('stepfunctions')", 'boto3.client("stepfunctions")']) },
  { service: "Bedrock", confidence: "high", matches: anyOf(["boto3.client('bedrock-runtime')", 'boto3.client("bedrock-runtime")', "boto3.client('bedrock')"]) },
];

const PY_DEP_PATTERNS: ServicePattern[] = [
  { service: "DynamoDB", confidence: "medium", matches: anyOf(["boto3", "botocore", "aioboto3"]) },
];

const FRAMEWORK_PATTERNS: Array<{ name: string; matches: (text: string) => boolean }> = [
  { name: "Model Context Protocol", matches: anyOf(["@modelcontextprotocol/sdk", '"mcp"', "mcp>=1"]) },
  { name: "Bedrock", matches: anyOf(["bedrock", "bedrock-runtime"]) },
  { name: "LangChain", matches: anyOf(["langchain", "langgraph"]) },
  { name: "Mastra", matches: anyOf(["@mastra/core", "mastra"]) },
  { name: "Genkit", matches: anyOf(["genkit", "@genkit-ai"]) },
  { name: "Strands", matches: anyOf(["strands-agents"]) },
  { name: "AWS CDK", matches: anyOf(["aws-cdk-lib", '"@aws-cdk/core"']) },
  { name: "Express", matches: anyOf(['"express"']) },
  { name: "Fastify", matches: anyOf(['"fastify"']) },
  { name: "Next.js", matches: anyOf(['"next"']) },
  { name: "NestJS", matches: anyOf(['"@nestjs/core"']) },
  { name: "Django", matches: anyOf(["django==", "Django==", "django>="]) },
  { name: "Flask", matches: anyOf(["flask==", "Flask==", "flask>="]) },
  { name: "FastAPI", matches: anyOf(["fastapi==", "fastapi>="]) },
  { name: "Gin", matches: anyOf(["github.com/gin-gonic/gin"]) },
  { name: "Axum", matches: anyOf(["axum ="]) },
];

const WEB_DEPENDENCY_NAMES = [
  "express",
  "fastify",
  "next",
  "@nestjs/core",
  "fastapi",
  "django",
  "flask",
  "gin",
  "axum",
];

export interface ManifestScan {
  services: DetectedService[];
  frameworks: string[];
  warnings: string[];
}

interface Accumulator {
  service: string;
  confidence: DetectedService["confidence"];
  sources: SignalSource[];
}

function addService(
  collected: Map<string, DetectedService>,
  service: string,
  confidence: DetectedService["confidence"],
  source: SignalSource,
): void {
  const existing = collected.get(service);
  if (!existing) {
    collected.set(service, { service, confidence, sources: [source] });
    return;
  }
  if (!existing.sources.some((entry) => entry.path === source.path)) existing.sources.push(source);
  if (confidence === "high") existing.confidence = "high";
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function dependencyNames(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object") return [];
  const record = manifest as Record<string, unknown>;
  const names: string[] = [];
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const block = record[key];
    if (block && typeof block === "object") {
      names.push(...Object.keys(block as Record<string, unknown>));
    }
  }
  return names;
}

function extractMcpServers(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object") return [];
  const record = manifest as Record<string, unknown>;
  const servers = record["mcpServers"] ?? record["servers"];
  return servers && typeof servers === "object" ? Object.keys(servers as Record<string, unknown>) : [];
}

function pythonRequirements(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .filter((line) => line.length > 0 && !line.startsWith("-"));
}

function pyprojectDependencies(text: string): string[] {
  const found: string[] = [];
  const block = /dependencies\s*=\s*\[([\s\S]*?)\]/u.exec(text);
  if (block?.[1]) {
    for (const match of block[1].matchAll(/"([^"]+)"/gu)) {
      if (match[1]) found.push(match[1]);
    }
  }
  const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/u.exec(text);
  if (poetry?.[1]) {
    for (const line of poetry[1].split(/\r?\n/u)) {
      const name = line.split("=")[0]?.trim();
      if (name && name.length > 0 && name !== "python") found.push(name);
    }
  }
  return found;
}

/**
 * Read the manifests in a snapshot.
 *
 * Nothing here throws on a malformed file: a dependency list that cannot be
 * parsed becomes a warning, because a broken lockfile is not a reason to refuse
 * to scan a repository.
 */
export function scanManifests(snapshot: RepoSnapshot): ManifestScan {
  const services = new Map<string, DetectedService>();
  const frameworks = new Set<string>();
  const warnings: string[] = [];

  for (const [path, body] of Object.entries(snapshot.manifests)) {
    const lower = path.toLowerCase();

    if (lower.endsWith("package.json")) {
      const parsed = safeParseJson(body);
      if (parsed === null) {
        warnings.push(`${path}: not valid JSON`);
        continue;
      }
      for (const name of dependencyNames(parsed)) {
        for (const pattern of JS_CLIENT_PATTERNS) {
          if (pattern.matches(name)) {
            addService(services, pattern.service, pattern.confidence, { kind: "manifest", path, detail: name });
          }
        }
        for (const framework of FRAMEWORK_PATTERNS) {
          if (framework.matches(JSON.stringify(name))) frameworks.add(framework.name);
        }
      }
      for (const server of extractMcpServers(parsed)) {
        frameworks.add("Model Context Protocol");
        frameworks.add(`MCP server: ${server}`);
      }
      continue;
    }

    if (lower.endsWith("requirements.txt") || lower.endsWith("pipfile")) {
      const lines = pythonRequirements(body);
      const joined = lines.join("\n");
      for (const pattern of PY_SERVICE_PATTERNS) {
        if (pattern.matches(joined)) {
          addService(services, pattern.service, pattern.confidence, { kind: "manifest", path });
        }
      }
      if (lines.some((line) => /^boto3\b/u.test(line))) {
        addService(services, "AWS SDK for Python", "medium", { kind: "manifest", path, detail: "boto3" });
      }
      for (const framework of FRAMEWORK_PATTERNS) {
        if (framework.matches(joined)) frameworks.add(framework.name);
      }
      continue;
    }

    if (lower.endsWith("pyproject.toml")) {
      const dependencies = pyprojectDependencies(body);
      const joined = dependencies.join("\n");
      for (const pattern of PY_SERVICE_PATTERNS) {
        if (pattern.matches(joined)) {
          addService(services, pattern.service, pattern.confidence, { kind: "manifest", path });
        }
      }
      if (dependencies.some((name) => name === "boto3" || name === "aioboto3")) {
        addService(services, "AWS SDK for Python", "medium", { kind: "manifest", path, detail: "boto3" });
      }
      for (const framework of FRAMEWORK_PATTERNS) {
        if (framework.matches(joined)) frameworks.add(framework.name);
      }
      continue;
    }

    if (lower.endsWith("go.mod")) {
      if (body.includes("aws-sdk-go")) {
        addService(services, "AWS SDK for Go", "high", { kind: "manifest", path });
        for (const [module_, service] of [
          ["service/dynamodb", "DynamoDB"],
          ["service/s3", "S3"],
          ["service/sqs", "SQS"],
          ["service/lambda", "Lambda"],
          ["service/sfn", "Step Functions"],
          ["service/bedrockruntime", "Bedrock"],
        ] as const) {
          if (body.includes(module_)) addService(services, service, "high", { kind: "manifest", path, detail: module_ });
        }
      }
      for (const framework of FRAMEWORK_PATTERNS) {
        if (framework.matches(body)) frameworks.add(framework.name);
      }
      continue;
    }

    if (lower.endsWith("cargo.toml")) {
      for (const [crate, service] of [
        ["aws-sdk-dynamodb", "DynamoDB"],
        ["aws-sdk-s3", "S3"],
        ["aws-sdk-sqs", "SQS"],
        ["aws-sdk-lambda", "Lambda"],
        ["aws-sdk-sfn", "Step Functions"],
        ["aws-sdk-bedrockruntime", "Bedrock"],
      ] as const) {
        if (body.includes(crate)) addService(services, service, "high", { kind: "manifest", path, detail: crate });
      }
      if (body.includes("aws-config")) addService(services, "AWS SDK for Rust", "medium", { kind: "manifest", path });
      for (const framework of FRAMEWORK_PATTERNS) {
        if (framework.matches(body)) frameworks.add(framework.name);
      }
      continue;
    }

    if (lower.endsWith(".mcp.json") || lower.endsWith("mcp.json")) {
      const parsed = safeParseJson(body);
      if (parsed === null) {
        warnings.push(`${path}: not valid JSON`);
        continue;
      }
      frameworks.add("Model Context Protocol");
      for (const server of extractMcpServers(parsed)) frameworks.add(`MCP server: ${server}`);
    }
  }

  return { services: [...services.values()], frameworks: [...frameworks].sort(), warnings };
}

/** True when any dependency names one of the web frameworks the gap rules look at. */
export function hasWebFramework(snapshot: RepoSnapshot): boolean {
  for (const [path, body] of Object.entries(snapshot.manifests)) {
    const lower = path.toLowerCase();
    if (lower.endsWith("package.json")) {
      const parsed = safeParseJson(body);
      if (dependencyNames(parsed).some((name) => WEB_DEPENDENCY_NAMES.includes(name))) return true;
    }
    if (
      lower.endsWith("requirements.txt") ||
      lower.endsWith("pyproject.toml") ||
      lower.endsWith("go.mod") ||
      lower.endsWith("pyproject.toml") ||
      lower.endsWith("cargo.toml")
    ) {
      const text = body.toLowerCase();
      if (WEB_DEPENDENCY_NAMES.some((name) => text.includes(name))) return true;
    }
  }
  return false;
}

/** The SDK clients a snapshot names, for the diagnostics' "what did we see" list. */
export function serviceSummary(snapshot: RepoSnapshot): Accumulator[] {
  const scan = scanManifests(snapshot);
  return scan.services.map((service) => ({
    service: service.service,
    confidence: service.confidence,
    sources: service.sources,
  }));
}
