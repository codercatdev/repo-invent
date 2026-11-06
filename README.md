# repo:Invent

re:Invent tells you what is new. **repo:Invent tells you what your repo is missing.**

Point it at a public GitHub repository. It reads the manifests and infrastructure-as-code, diagnoses the architecture gaps in that codebase, picks the re:Invent 2026 sessions that close those gaps, builds a week you can actually walk, and writes the take-home plan as tickets with acceptance tests.

The schedule ends on December 4. The tickets start the week after.

**Live demo:** https://7t254hlko26vjs3tlyv7f2u26y0jbree.lambda-url.us-east-1.on.aws/

Built for the **AWS re:Invent 2026 Event Catalog API Hackathon**. The submission article is in `docs/builder-center-article.md`, and the comparison against the other public entries is in `docs/competitive-analysis.md`.

## The idea

Everybody ships a session planner. The catalog already has thousands of sessions and plenty of apps that rank them.

This one starts from the other end: **your code.** It asks what your repository does not have, and builds the week around fixing that. Every gap becomes a ticket someone can pick up, and every ticket carries the acceptance test that proves it was closed.

That is the part that outlives the conference.

## What it does

| Step | What happens | Needs sign-in |
|---|---|---|
| 1. Scan | Read a public repo over the GitHub API. No clone. | No |
| 2. Diagnose | Detect AWS services, compute, IaC, observability, and rank architecture gaps with real file evidence. | No |
| 3. Prescribe | Score the catalog against the fingerprint and gaps, then plan a walkable week. | No |
| 4. Export | Write `reinvent-plan.md` and issue payloads. | No |
| 5. Apply | Reserve seats and favourite sessions, verified from `GetSchedule`. | Yes |

Steps 1 to 4 are the demo. A judge with no AWS account and no registration gets a full result in about ten seconds.

## Install

```bash
git clone <this-repo>
cd repo-invent
npm install
npm run build
```

Requires Node 20 or newer.

## Quick start

No credentials needed:

```bash
node dist/cli.js scan https://github.com/aws-samples/aws-serverless-ecommerce-platform
node dist/cli.js plan https://github.com/aws-samples/aws-serverless-ecommerce-platform --offline
```

`--offline` reads the bundled fixture catalog, so this works with no sign-in and no network beyond GitHub.

To plan against the live catalog, sign in first:

```bash
node dist/cli.js login      # opens AWS Builder ID in your browser
node dist/cli.js plan https://github.com/your/repo --out ./out
```

## Try it in a browser

The app needs no account and no AWS setup:

```bash
npm run build
npm run web                 # http://127.0.0.1:8080
```

It listens on loopback only. To open it from a phone or another machine on your
network or Tailscale, bind explicitly:

```bash
REPO_INVENT_BIND=0.0.0.0 npm run web        # any interface
REPO_INVENT_BIND=100.x.y.z npm run web      # one interface only
```

It is a mobile-first four-tab app, the shape of the official re:Invent app.

| Tab | What it shows |
|---|---|
| **Home** | Your week, an **Ask AWS** box, and the repo check |
| **Catalog** | Every session, with search and filters by type, level, venue and track |
| **Calendar** | Your reservations and favourites, by day, read back from the API |
| **Parties** | 171 vendor and community parties, searchable, with RSVP and map links |

The repo check sits directly under the Ask box. Scan a repository and Home shows the gaps, the planned week, and the tickets. Tap any session for its detail and a Save button.

Each tab also answers on its own path: `/home`, `/catalog`, `/calendar`, `/parties`. The original single-page scan stays at **`/scan`**, with the full result: the availability heatmap, the progress panel where rating a session closes its gaps, and a link to **`/report`**, the same plan as one printable page.

The catalog is served from a disk cache under `~/.repo-invent`, refreshed every six hours. A read that falls back to the bundled fixture says so on the page; nothing synthetic is passed off as live. Set `REPO_INVENT_LIVE_CATALOG=0` to stay offline.

The parties data comes from [conferenceparties.com](https://conferenceparties.com/reinvent2026/). It is unofficial; every card links to the sponsor's own RSVP page. Re-scrape with:

```bash
node scripts/parse-parties.mjs <saved-page.html> data/parties.json
node scripts/enrich-parties.mjs data/parties.json
```

If GitHub is rate-limiting anonymous calls, the demo repository falls back to a recorded snapshot and the page says so. It never passes a substitute off as a live read.

### Deploy it publicly

`deploy/deploy.sh` ships the same page to AWS Lambda behind a Function URL:

```bash
aws configure               # or: aws sso login
./deploy/deploy.sh us-east-1
```

It creates one function, one public URL, and a log group with 7-day retention, then prints the URL. `deploy/teardown.sh` removes all of it. This costs a few cents a month on demo traffic and runs in your own account.

## Commands

| Command | What it does |
|---|---|
| `scan <repo>` | Stack fingerprint and ranked gaps. `--json` for machine output. |
| `plan <repo>` | Scan, prescribe a schedule, build tickets. `--offline`, `--json`, `--out <dir>`. |
| `diff <a.json> <b.json>` | Unified-diff view of two plans, for review before applying. |
| `login` / `logout` | Sign in with AWS Builder ID, or revoke the stored token. |
| `apply --file <plan.json>` | Reserve and favourite. Dry run unless `--yes`. |
| `export --file <plan.json>` | Write the Markdown plan and issue JSON. |
| `mcp` | Run the local MCP server on stdio. |
| `audit` | Probe which Events operations this account can reach. |

## MCP server

Five tools, on stdio:

| Tool | Input | Output |
|---|---|---|
| `scan_repository` | repo URL | fingerprint and gaps |
| `prescribe_reinvent_schedule` | repo URL, offline? | full plan |
| `apply_schedule_diff` | repo URL, **confirm: true** | what was actually held |
| `export_remediation_plan` | repo URL, offline? | markdown and issue payloads |
| `audit` | offline? | reachability report |

`apply_schedule_diff` refuses to write anything unless you pass `confirm: true`.

Claude Desktop, Kiro, or any MCP client:

```json
{
  "mcpServers": {
    "repo-invent": {
      "command": "node",
      "args": ["/absolute/path/to/repo-invent/dist/mcp-server.js"]
    }
  }
}
```

## How it reads a repo

No clone. Five to fifteen HTTP calls:

1. `GET /repos/{owner}/{repo}` for the default branch and languages.
2. `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1` for the tree.
3. `GET /repos/{owner}/{repo}/contents/{path}` for a ranked subset of files.

Caps, enforced in code: 40 files, 300 KB total, 100 KB per file. Manifests rank first, documentation last. Results are cached for 15 minutes and every request has a 20 second timeout.

`GITHUB_TOKEN` is optional and only raises the rate limit.

## How it diagnoses

Six gap rules, each requiring real evidence from files that were read:

| Gap | Fires when |
|---|---|
| Agent stack with no orchestration | MCP or Bedrock present, no Step Functions |
| DynamoDB with no resilience | DynamoDB, no Streams, no DAX, no DLQ |
| Compute with no tracing | Lambda/ECS/EKS, no OpenTelemetry |
| No queue isolation | Three or more services, no SQS or SNS |
| Public API with no WAF | A web framework, no WAF or throttle |
| Wildcard IAM | An IAM policy with a wildcard action |

A repo too small to support a claim produces no gap. Inventing evidence would be worse than finding nothing.

## How it plans

- Scores each session against the gaps, the services the repo already runs, and the recommended level.
- Interactive formats that are full or not reservable go to the **walk-up queue** as favourites. There is no seat count in this API, only a coarse fullness signal.
- Recorded lectures go to the **YouTube watchlist**, so you do not cross the Strip for something you can watch later.
- Enforces the **10-minute seat forfeiture rule**: a reserved seat is released ten minutes before start, so the transfer needs travel time plus ten minutes.
- Adds one 30-minute **Repo Architecture Synthesis** block per day.
- Never cancels before a reserve is confirmed from `GetSchedule`.

## The API surface

All twelve operations, against `https://api.awsevents.com/v1`:

`ListEvents` · `GetEvent` · `ListSessions` · `GetSession` · `GetSchedule` · `ReserveSessions` · `CancelReservation` · `AssociateFavorites` · `DisassociateFavorite` · `CreatePersonalTime` · `UpdatePersonalTime` · `DeletePersonalTime`

Plus a remote MCP bridge to `https://api.awsevents.com/mcp`, and a local MCP server of its own.

Details the implementation takes seriously, all verified against the AWS docs:

| Detail | Why it matters |
|---|---|
| Redirect is `http://localhost:8484/callback` | Only ports 8484 to 8489 are registered for a self-built app. Port 8976 works only for installed MCP clients. |
| 403 with a body vs 403 without | A body means "signed in, not registered". No body means the edge refused you. Different fixes. |
| A 200 from `ReserveSessions` is not success | Failures come back per session. A session already reserved reports as a failure. |
| No idempotency key | After an unknown write outcome, re-read `GetSchedule` and send only what is missing. |
| Create personal time returns 204, no body | Read `GetSchedule` for the new id. |
| Paginate until `nextToken` is absent | A short page is not the last page. |
| Refresh on `expires_in` | Never a hardcoded 60 minutes. Persist the rotated refresh token. |

## Tests

```bash
npm test        # 21 tests
npm run typecheck
```

The tests cover repo parsing, ranking, fetch caps, typed failures, the ten-minute rule, conflict-free planning, the walk-up and watchlist routing, ticket generation, and the plan diff. None of them touch the network.

## Layout

```
src/
  auth/pkce.ts              OAuth 2.0 PKCE for AWS Builder ID
  api/events-client.ts      all twelve Events operations, quotas, retries
  api/remote-mcp-bridge.ts  client for the AWS Events remote MCP server
  scanner/repo-fetch.ts     public GitHub read, with caps and cache
  scanner/manifest-parser.ts  SDK clients and frameworks from manifests
  scanner/iac-parser.ts     Terraform, CDK, Serverless, SST, Dockerfile
  scanner/diagnostics.ts    fingerprint and the six gap rules
  solver/transit-guard.ts   venue travel plus the ten-minute rule
  solver/scorer.ts          scoring, week planning, tickets
  export/                   Markdown plan, issue payloads, plan diff
  mcp-server.ts             local MCP server, five tools
  web.ts                    the browser demo server
  lambda.ts                 the same page behind a Lambda Function URL
  cli.ts                    the `repo-invent` command
web/
  index.html                the demo page, no build step
deploy/
  deploy.sh                 one-command deploy to Lambda
  teardown.sh               removes everything it created
data/
  venues-transit.json       venue walk and shuttle matrix
  mock-reinvent2026.json    synthetic test fixture, never presented as live
```

## Honest limits

- Fullness is coarse. The API reports a signal, not a seat count, so "full" is a best guess.
- The catalog needs an account registered for the event. An unregistered token gets a 403, and signing in again does not help.
- A public repo is capped at 40 files. Very large monorepos are read partially, and the plan says so.
- The venue matrix is an estimate, built for headroom rather than navigation.

## License

MIT
