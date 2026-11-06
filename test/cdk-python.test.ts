import { describe, expect, it } from "vitest";
import { scanIac } from "../src/scanner/iac-parser.js";
import { rankCandidates } from "../src/scanner/repo-fetch.js";
import type { RepoSnapshot } from "../src/types.js";

/**
 * A CDK app written in Python declares its resources in the stack file, not in
 * any dependency manifest. Before `.py` was readable, this repository scanned
 * as "no services, no gaps", which is the worst possible answer: wrong, and
 * confident.
 */
const STACK = `from aws_cdk import (
    Stack,
    aws_dynamodb as dynamodb,
    aws_lambda as lambda_,
    aws_s3 as s3,
    aws_sqs as sqs,
    aws_sns as sns,
)
from constructs import Construct


class OrdersStack(Stack):
    def __init__(self, scope: Construct, id: str) -> None:
        super().__init__(scope, id)

        table = dynamodb.Table(self, "Orders", partition_key=...)
        bucket = s3.Bucket(self, "Assets")
        queue = sqs.Queue(self, "Jobs")
        topic = sns.Topic(self, "Events")
        fn = lambda_.Function(self, "Handler", handler="index.handler")
`;

function snapshot(paths: Record<string, string>): RepoSnapshot {
  return {
    ref: { owner: "aws-samples", repo: "orders" },
    defaultBranch: "main",
    languages: { Python: 100 },
    files: Object.keys(paths).map((path) => ({ path, size: paths[path].length, sha: "x" })),
    manifests: paths,
    truncated: false,
  } as unknown as RepoSnapshot;
}

describe("CDK with Python", () => {
  it("finds the resources a Python stack declares", () => {
    const scan = scanIac(snapshot({ "orders/orders_stack.py": STACK }));
    const services = scan.services.map((entry) => entry.service);
    expect(services).toContain("DynamoDB");
    expect(services).toContain("Lambda");
    expect(services).toContain("S3");
    expect(services).toContain("SQS");
    expect(services).toContain("SNS");
    expect(scan.iac).toContain("cdk");
  });

  it("does not call plain Python a CDK app", () => {
    const scan = scanIac(snapshot({ "app/handler.py": "def handler(event, context):\n    return {}\n" }));
    expect(scan.iac ?? []).not.toContain("cdk");
  });

  it("ranks a stack file above ordinary Python", () => {
    const files = [
      { path: "app/handler.py", size: 40, sha: "a" },
      { path: "infra/orders_stack.py", size: 40, sha: "b" },
      { path: "README.md", size: 10, sha: "c" },
    ].map((file) => ({ ...file, type: "blob" }));
    const order = rankCandidates(files as never).map((file) => file.path);
    expect(order.indexOf("infra/orders_stack.py")).toBeLessThan(order.indexOf("app/handler.py"));
  });
});
