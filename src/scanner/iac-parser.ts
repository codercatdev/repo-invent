import type { DetectedService, RepoSnapshot } from "../types.js";

export type IacKind = "terraform" | "cdk" | "serverless" | "sst" | "none";
export type ComputeKind = "lambda" | "ecs" | "eks" | "ec2" | "apprunner" | "unknown";

export interface IacScan {
  iac: IacKind[];
  compute: ComputeKind[];
  services: DetectedService[];
  observability: {
    xray: boolean;
    openTelemetry: boolean;
    cloudwatchAlarms: boolean;
    structuredLogging: boolean;
  };
  docker: {
    present: boolean;
    baseImages: string[];
    multiStage: boolean;
  };
  filesConsidered: string[];
  warnings: string[];
}

interface ResourcePattern {
  service: string;
  needles: string[];
}

const TERRAFORM_RESOURCES: ResourcePattern[] = [
  { service: "Lambda", needles: ["aws_lambda_function", "aws_lambda_layer_version"] },
  { service: "DynamoDB", needles: ["aws_dynamodb_table", "aws_dynamodb_global_table"] },
  { service: "ECS", needles: ["aws_ecs_service", "aws_ecs_task_definition", "aws_ecs_cluster"] },
  { service: "EKS", needles: ["aws_eks_cluster", "aws_eks_node_group"] },
  { service: "SQS", needles: ["aws_sqs_queue"] },
  { service: "SNS", needles: ["aws_sns_topic"] },
  { service: "Step Functions", needles: ["aws_sfn_state_machine"] },
  { service: "API Gateway", needles: ["aws_apigatewayv2_api", "aws_api_gateway_rest_api"] },
  { service: "CloudWatch", needles: ["aws_cloudwatch_metric_alarm", "aws_cloudwatch_log_group"] },
  { service: "IAM", needles: ["aws_iam_role", "aws_iam_policy", "aws_iam_role_policy"] },
  { service: "WAF", needles: ["aws_wafv2_web_acl"] },
  { service: "S3", needles: ["aws_s3_bucket"] },
  { service: "Secrets Manager", needles: ["aws_secretsmanager_secret"] },
  { service: "Cognito", needles: ["aws_cognito_user_pool"] },
];

const CDK_RESOURCES: ResourcePattern[] = [
  { service: "Lambda", needles: ["lambda.Function", "NodejsFunction", "PythonFunction"] },
  { service: "DynamoDB", needles: ["dynamodb.Table", "TableV2"] },
  { service: "Step Functions", needles: ["stepfunctions.StateMachine", "stepfunctions"] },
  { service: "SQS", needles: ["sqs.Queue"] },
  { service: "SNS", needles: ["sns.Topic"] },
  { service: "API Gateway", needles: ["apigateway.RestApi", "apigatewayv2.HttpApi", "HttpApi"] },
  { service: "ECS", needles: ["ecs.FargateService", "ecs.Cluster", "ecsPatterns"] },
  { service: "EKS", needles: ["eks.Cluster", "eks.FargateCluster"] },
  { service: "WAF", needles: ["wafv2.CfnWebACL", "wafv2"] },
  { service: "IAM", needles: ["iam.Role", "iam.PolicyStatement"] },
  { service: "CloudWatch", needles: ["cloudwatch.Alarm", "cloudwatch"] },
  { service: "Bedrock", needles: ["bedrock"] },
];

const SST_RESOURCES: ResourcePattern[] = [
  { service: "Lambda", needles: ["new sst.aws.Function", "sst.aws.Function"] },
  { service: "DynamoDB", needles: ["new sst.aws.Dynamo"] },
  { service: "SQS", needles: ["new sst.aws.Queue"] },
  { service: "SNS", needles: ["new sst.aws.Topic"] },
  { service: "API Gateway", needles: ["new sst.aws.ApiGatewayV2"] },
  { service: "ECS", needles: ["new sst.aws.Cluster", "sst.aws.Service"] },
  { service: "S3", needles: ["new sst.aws.Bucket"] },
];

const SERVERLESS_RESOURCES: ResourcePattern[] = [
  { service: "Lambda", needles: ["AWS::Serverless::Function", "handler:"] },
  { service: "DynamoDB", needles: ["AWS::DynamoDB::Table", "dynamodb:"] },
  { service: "SQS", needles: ["AWS::SQS::Queue", "sqs:"] },
  { service: "SNS", needles: ["AWS::SNS::Topic", "sns:"] },
  { service: "Step Functions", needles: ["AWS::StepFunctions::StateMachine", "stepFunctions"] },
  { service: "API Gateway", needles: ["AWS::ApiGateway::", "httpApi", "http:"] },
];

const OBSERVABILITY_NEEDLES = {
  xray: ["aws_xray", "xray:Active", "xrayEnabled", "Tracing: Active", "X-Ray", "xray.Tracing"],
  openTelemetry: [
    "opentelemetry",
    "opentelemetry-collector",
    "otel",
    "aws-observability",
    "adot",
    "@opentelemetry/sdk-node",
    "opentelemetry-instrument",
  ],
  cloudwatchAlarms: ["aws_cloudwatch_metric_alarm", "cloudwatch.Alarm", "AWS::CloudWatch::Alarm"],
  structuredLogging: ["pino", "winston", "structlog", "loguru", "zap", "logrus", "tracing_subscriber"],
};

function anyNeedle(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function collect(
  found: Map<string, { sources: Set<string>; detail: string }>,
  pattern: ResourcePattern,
  text: string,
  path: string,
): void {
  const hits = pattern.needles.filter((needle) => text.includes(needle));
  if (hits.length === 0) return;
  const existing = found.get(pattern.service);
  if (existing) {
    existing.sources.add(path);
    return;
  }
  found.set(pattern.service, { sources: new Set([path]), detail: hits.join(", ") });
}

/** Parse a Dockerfile's base images and stage count. */
export function parseDockerfile(text: string): { baseImages: string[]; multiStage: boolean } {
  const baseImages: string[] = [];
  let stageCount = 0;
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (/^from\s+/iu.test(trimmed)) {
      stageCount += 1;
      const parts = trimmed.split(/\s+/u);
      const image = parts[1];
      if (image) {
        const withoutDigest = image.split("@")[0] ?? image;
        baseImages.push(withoutDigest);
      }
    }
  }
  return { baseImages, multiStage: stageCount > 1 };
}

/**
 * Read the infrastructure-as-code in a snapshot.
 *
 * Each service found here is a HIGH confidence signal, because an IaC resource
 * is a declaration rather than a mention.
 */
export function scanIac(snapshot: RepoSnapshot): IacScan {
  const iac: Set<IacKind> = new Set();
  const compute: Set<ComputeKind> = new Set();
  const found = new Map<string, { sources: Set<string>; detail: string }>();
  const filesConsidered: string[] = [];
  const warnings: string[] = [];

  let xray = false;
  let openTelemetry = false;
  let cloudwatchAlarms = false;
  let structuredLogging = false;

  let dockerPresent = false;
  const baseImages: string[] = [];
  let multiStage = false;

  for (const [path, body] of Object.entries(snapshot.manifests)) {
    const name = baseName(path);
    const lowerName = name.toLowerCase();
    const lowerPath = path.toLowerCase();
    filesConsidered.push(path);

    if (lowerName === "dockerfile" || lowerName.startsWith("dockerfile.")) {
      dockerPresent = true;
      const parsed = parseDockerfile(body);
      baseImages.push(...parsed.baseImages);
      if (parsed.multiStage) multiStage = true;
    }

    if (lowerName.endsWith(".tf") || lowerName.endsWith(".tfvars")) {
      iac.add("terraform");
      for (const pattern of TERRAFORM_RESOURCES) collect(found, pattern, body, path);
    }

    if (lowerName === "cdk.json") {
      iac.add("cdk");
    }

    if (lowerPath.includes("/lib/") && lowerName.endsWith(".ts") && body.includes("aws-cdk-lib")) {
      iac.add("cdk");
    }

    if (lowerName === "cdk.json" || (lowerName.endsWith(".ts") && body.includes("from \"aws-cdk-lib\""))) {
      for (const pattern of CDK_RESOURCES) collect(found, pattern, body, path);
    }

    if (lowerName === "serverless.yml" || lowerName === "serverless.yaml") {
      iac.add("serverless");
      for (const pattern of SERVERLESS_RESOURCES) collect(found, pattern, body, path);
    }

    if (lowerName === "sst.config.ts") {
      iac.add("sst");
      for (const pattern of SST_RESOURCES) collect(found, pattern, body, path);
    }

    if (anyNeedle(body, OBSERVABILITY_NEEDLES.xray)) xray = true;
    if (anyNeedle(body, OBSERVABILITY_NEEDLES.openTelemetry)) openTelemetry = true;
    if (anyNeedle(body, OBSERVABILITY_NEEDLES.cloudwatchAlarms)) cloudwatchAlarms = true;
    if (anyNeedle(body, OBSERVABILITY_NEEDLES.structuredLogging)) structuredLogging = true;
  }

  for (const service of found.keys()) {
    if (service === "Lambda" || service === "ECS" || service === "EKS" || service === "EC2" || service === "App Runner") {
      const kind =
        service === "Lambda"
          ? "lambda"
          : service === "ECS"
            ? "ecs"
            : service === "EKS"
              ? "eks"
              : service === "EC2"
                ? "ec2"
                : "apprunner";
      compute.add(kind);
    }
  }

  const services: DetectedService[] = [...found.entries()].map(([service, meta]) => ({
    service,
    confidence: "high" as const,
    sources: [...meta.sources].map((path) => ({ kind: "iac" as const, path, detail: meta.detail })),
  }));

  const iacList = [...iac];
  if (iacList.length === 0) {
    warnings.push("no infrastructure-as-code found; topology is inferred from manifests only");
    iacList.push("none");
  }
  if (compute.size === 0) compute.add("unknown");

  return {
    iac: iacList,
    compute: [...compute],
    services,
    observability: { xray, openTelemetry, cloudwatchAlarms, structuredLogging },
    docker: { present: dockerPresent, baseImages: [...new Set(baseImages)], multiStage },
    filesConsidered,
    warnings,
  };
}

/** True when a wildcard action is present in an IAM policy body. */
export function hasWildcardIam(snapshot: RepoSnapshot): { wildcard: boolean; files: string[] } {
  const files: string[] = [];
  for (const [path, body] of Object.entries(snapshot.manifests)) {
    const lower = path.toLowerCase();
    const relevant =
      lower.endsWith(".tf") ||
      lower.endsWith(".json") ||
      lower.endsWith(".yml") ||
      lower.endsWith(".yaml") ||
      lower.endsWith(".ts");
    if (!relevant) continue;
    if (/["']Action["']\s*:\s*["']\*["']/u.test(body) || /actions\s*=\s*\[\s*"\*"\s*\]/u.test(body)) {
      files.push(path);
    }
  }
  return { wildcard: files.length > 0, files };
}
