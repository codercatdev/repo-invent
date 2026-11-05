# Subagent 2: Public GitHub Repo Scanner

PROJECT: `/home/alex/.kiro/crew/workspace/repo-invent`
TypeScript, NodeNext ESM, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

FIRST read: `/home/alex/.kiro/crew/workspace/repo-invent/src/types.ts`
Use the types exactly as declared: `RepoRef`, `RepoSnapshot`, `RepoFile`, `SignalSource`, `DetectedService`, `StackFingerprint`, `ArchitecturalGap`, `Evidence`, `SessionLevel`.

## You own exactly these files. Create only these.

- `src/scanner/repo-fetch.ts`
- `src/scanner/manifest-parser.ts`
- `src/scanner/iac-parser.ts`
- `src/scanner/diagnostics.ts`

Do not touch `package.json`, `tsconfig.json`, `src/types.ts`, or any file another agent owns.

## The input is a PUBLIC GitHub repo, not a local directory

No `git` process, no clone. Five to fifteen HTTP calls per repo, not a full download. A judge pastes a URL and gets an answer.

## 1. `src/scanner/repo-fetch.ts`

`fetchRepo(slug: string, opts?): Promise<FetchResult>`

- Accept `https://github.com/owner/repo`, `github.com/owner/repo`, and bare `owner/repo`. Also accept a trailing `.git` and an optional `/tree/<ref>`.
- Unauthenticated GitHub REST:
  - `GET https://api.github.com/repos/{owner}/{repo}` for `default_branch` and `languages`
  - `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1` for the file list
- Read `GITHUB_TOKEN` from the environment. If set, send `Authorization: Bearer`. If absent, work fine unauthenticated.
- HARD CAPS, enforced in code: at most 40 files fetched, 300 KB total, each file 100 KB max. Skip binary extensions. Order candidate files: manifests and IaC first, then top-level `src/` files. When a cap bites, set `truncated: true`.
- Return which paths were actually fetched in `snapshot.files` and which bodies in `snapshot.manifests`.
- `FetchResult` is a local interface you declare: a discriminated union of `{ ok: true; snapshot: RepoSnapshot }` and `{ ok: false; error: { kind: "not_found" | "rate_limited" | "network" | "bad-url"; message: string; retryAfterSeconds?: number } }`.
- Distinguish a GitHub rate-limit refusal (`x-ratelimit-remaining: 0`, or 403 with that header) from a repo-level 403. Never throw for a 404 repo — return a typed error.
- Never log or return a token.

## 2. `src/scanner/manifest-parser.ts`

Parse `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `.mcp.json` from the snapshot bodies.

- AWS SDK clients: `@aws-sdk/client-*` mapped to service names (`client-dynamodb` -> `DynamoDB`, `client-sfn` -> `Step Functions`, `client-bedrock-runtime` -> `Bedrock`). Also `boto3`/`botocore` usage strings, and `aws-cdk-lib` constructs.
- AI and agent frameworks: `@modelcontextprotocol/sdk`, bedrock, langchain, mastra, genkit, strands.
- Web and compute stacks: express, fastify, next, nest, django, flask, fastapi, gin, axum.
- Return `DetectedService[]` with a confidence of `high` | `medium` | `low` and `SignalSource[]` naming real paths from the snapshot.
- Handle malformed files without throwing. A parse failure becomes a warning, not a crash.

## 3. `src/scanner/iac-parser.ts`

Scan Terraform (`*.tf`), CDK (`cdk.json`, `lib/*.ts`), Serverless and SST (`serverless.yml`, `sst.config.ts`), and `Dockerfile`.

- Detect resource types: `aws_lambda_function`, `aws_dynamodb_table`, `aws_ecs_*`, `aws_eks_*`, `aws_sqs_queue`, `aws_sns_topic`, `aws_sfn_state_machine`, `aws_apigateway*`, `aws_cloudwatch*`, `aws_iam*`, `AWS::Serverless::*`, `new sst.aws.*`, Lambda and DynamoDB CDK constructs.
- Detect observability: X-Ray, OpenTelemetry, `aws-xray-sdk`, `otel`, CloudWatch alarms, structured logging libraries.
- Dockerfile: base image, multi-stage, entrypoint.
- Report `iac` as `terraform` | `cdk` | `serverless` | `sst` | `none`, and `compute` as `lambda` | `ecs` | `eks` | `ec2` | `apprunner` | `unknown`.

## 4. `src/scanner/diagnostics.ts`

`buildFingerprint(snapshot, manifests, iac): StackFingerprint` and `diagnose(fingerprint): ArchitecturalGap[]`.

- `recommendedLevel`: 200 for plain application code, 300 for real AWS service usage, 400–500 for advanced IaC plus several services.
- Gaps to detect. Each maps to `taggedServices` and `searchTopics`:
  1. MCP or agent usage detected with no Step Functions orchestration and no Bedrock Guardrails.
  2. DynamoDB usage with no Streams, no DAX, and no dead-letter queue.
  3. Lambda or container compute with no OpenTelemetry or X-Ray observability.
  4. Multi-service architecture with no queue-per-service failure isolation (no SQS, SNS, or DLQ).
  5. A public API (API Gateway or ALB) with no WAF and no rate-limiting signal.
  6. IAM roles present with no least-privilege signal (wildcard policy strings).
- Every gap MUST carry `Evidence` with real file paths that came from the snapshot.
- Rank by severity. If the repo is too small to diagnose, return an empty array and a warning. NEVER fabricate evidence you did not read.

## Rules

Strict TS. No `any` unless a comment justifies it. Use global `fetch` (Node 20+). No new dependencies. Your code must not throw when the snapshot is empty or every file failed to parse.

## Verify

```
cd /home/alex/.kiro/crew/workspace/repo-invent
npx tsc -p tsconfig.json --noEmit
```

Zero errors attributable to your files.

## Report back

Files created, the exact GitHub API endpoints used, the minimum evidence each gap requires, and the tsc result.
