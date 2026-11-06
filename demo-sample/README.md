# reinvent-demo-shop

A deliberately ordinary order service, used to show what **repo:Invent** diagnoses.

It runs on Lambda, stores orders in DynamoDB, and exposes an HTTP API. It has the gaps a real team would have after a fast first release:

| Gap | Where to look |
| --- | --- |
| DynamoDB with no Streams, DAX or dead-letter queue | `infra/main.tf` declares the table and nothing else |
| Lambda with no OpenTelemetry or X-Ray tracing | no tracing dependency anywhere |
| IAM policy granting a wildcard action | `infra/main.tf`, the `orders` policy |
| Public API with no WAF or rate limiting | `aws_apigatewayv2_api` and no `aws_wafv2_web_acl` |
| Agent stack with no orchestration | `@modelcontextprotocol/sdk` is a dependency, and there is no Step Functions |

Scan it with:

```bash
node dist/cli.js scan https://github.com/<owner>/reinvent-demo-shop
```

Or paste the URL into the demo page.

## What it is not

It is not a good reference architecture. That is the point: it is a realistic one, and the gaps are the demo.
