# Submission copy for AWS Builder Center

Everything below is ready to paste into the project form.

## Title

repo:Invent — your repository plans your re:Invent week

## One-line description

Point repo:Invent at a public GitHub repository and it finds that codebase's AWS architecture gaps, plans the re:Invent 2026 sessions that close them, and leaves you tickets with acceptance tests.

## Short description (about 300 characters)

re:Invent tells you what is new; repo:Invent tells you what your repo is missing. It scans a public GitHub repo, diagnoses its AWS architecture gaps with file evidence, plans a walkable week around closing them, and exports tickets with acceptance tests.

## Full description

Every re:Invent planner starts with a form: your level, your topics, the services you use. You fill it from memory, and the recommendations reflect your memory.

repo:Invent works the other way round. Paste a public GitHub URL. It reads the dependency manifests and the infrastructure-as-code over the GitHub API — no clone, capped at 40 files — and works out which AWS services that codebase actually runs.

From that it diagnoses architecture gaps with evidence from real files: a DynamoDB table with no Streams, no DAX and no dead-letter queue; Lambda compute with no OpenTelemetry; a public API with no WAF and no throttle; an IAM policy granting a wildcard; an agent stack with no orchestration. A repository too small to support a claim produces no gap, because a guessed diagnosis is worse than none.

Then it plans the week. All twelve AWS Events API operations are implemented against the live catalog of 2,476 sessions. Every transfer is checked against the ten-minute seat forfeiture rule: a reserved seat is released ten minutes before start, so the walk between venues plus that ten minutes must fit. Interactive formats that are full or not reservable go to a walk-up queue; recorded lectures go to a watchlist; a 30-minute synthesis block is protected every day.

The part that outlives the conference is the export. Each gap becomes a ticket with a concrete acceptance test, a Markdown plan, and GitHub issue payloads. The week ends December 4; the tickets start the Monday after.

Around that, the app is built for a phone, in the shape of the official re:Invent app: four tabs. **Home** holds the Ask box, with the repository check directly beneath it; after a scan the same screen shows the gaps, the week day by day with walking time between venues, and the tickets. **Catalog** searches all 2,279 sessions, with filters for type, level and venue. **Calendar** shows what you booked, read back from `GetSchedule`. **Parties** lists 171 community and vendor parties with times, venues, the organizer's own RSVP link and a map, because the day does not end when the sessions do.

The site needs no sign-in. The live catalog, seat reservations and favourites use OAuth 2.0 PKCE against AWS Builder ID, and every write is verified by reading `GetSchedule` back, because the API reports per-session failures and a `200` is not a success.

Built with TypeScript, Node 20, zod, the MCP SDK, and the AWS Events REST and MCP surfaces. 49 tests, none of them touching the network.

Tags: reinvent, aws-events-api, mcp, agentic-ai, developer-tools, static-analysis, serverless, productivity

## How it uses the API or MCP server

All twelve REST operations: `ListEvents`, `GetEvent`, `ListSessions`, `GetSession`, `GetSchedule`, `ReserveSessions`, `CancelReservation`, `AssociateFavorites`, `DisassociateFavorite`, `CreatePersonalTime`, `UpdatePersonalTime`, `DeletePersonalTime`.

Plus the remote MCP server at `api.awsevents.com/mcp` as a client bridge, and a local stdio MCP server of its own exposing five tools: `scan_repository`, `prescribe_reinvent_schedule`, `apply_schedule_diff`, `export_remediation_plan`, `audit`.

Details implemented from the documentation and confirmed against the live catalog:

- OAuth 2.0 authorization code with PKCE, S256 challenge, on loopback ports 8484–8489 with an exact-match `/callback` path
- `403` with a JSON body means "signed in, not registered"; a `403` with no body is an edge refusal, handled differently
- Bulk writes return `{result: {successful, failed}}`, at most ten session ids per request, and are counted per session against the quota
- No idempotency key: after an unknown write outcome the code re-reads `GetSchedule` and sends only what is missing
- `CreatePersonalTime` returns 204 with no body, so the new id comes from `GetSchedule`
- Pagination stops only when `nextToken` is absent; a short page is not the last page
- Token refresh is scheduled from the response's `expires_in`, and the rotated refresh token is persisted

## What was built

| Area | Files |
| --- | --- |
| Auth | `src/auth/pkce.ts` |
| Events API | `src/api/events-client.ts`, `src/api/remote-mcp-bridge.ts` |
| Repo scanner | `src/scanner/repo-fetch.ts`, `manifest-parser.ts`, `iac-parser.ts`, `diagnostics.ts` |
| Planner | `src/solver/transit-guard.ts`, `scorer.ts`, `candidates.ts` |
| Exports | `src/export/markdown.ts`, `github-issues.ts`, `plan-diff.ts`, `report.ts` |
| Surfaces | `src/cli.ts`, `src/mcp-server.ts`, `src/web.ts`, `src/lambda.ts`, `src/reflect.ts` |
| Site | `web/index.html` |
| Deploy | `deploy/deploy.sh`, `deploy/teardown.sh` |

## Demo

One click on "see the sample result" scans a small repository bundled inside the app, so the full result appears with no sign-in, no AWS account and no network. Any public repository can also be pasted in and read live.

## Honest limitations

- Fullness in the catalog is coarse: `isReservable`, not a seat count.
- A public repository is read up to 40 files; a large monorepo is diagnosed partially and says so.
- Reflections are stored in the browser only.
- The venue walk times are estimates built for headroom, not for navigation.
