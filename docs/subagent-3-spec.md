# Subagent 3: Solver, CLI & Local MCP Server

PROJECT: `/home/alex/.kiro/crew/workspace/repo-invent`
TypeScript, NodeNext ESM, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
Deps installed: zod v4, `@modelcontextprotocol/sdk` v1.32.

FIRST read:
1. `/home/alex/.kiro/crew/workspace/repo-invent/docs/api-research.md`
2. `/home/alex/.kiro/crew/workspace/repo-invent/src/types.ts`

## You own exactly these files. Create only these.

- `data/venues-transit.json`
- `src/solver/transit-guard.ts`
- `src/solver/scorer.ts`
- `src/config.ts`
- `src/mcp-server.ts`
- `src/cli.ts`

Do not touch `package.json`, `tsconfig.json`, `src/types.ts`, or any file another agent owns.

## Available from other agents (import these; do NOT create them)

- `src/scanner/repo-fetch.ts` — `fetchRepo(slug, opts)` returning a typed result
- `src/scanner/manifest-parser.ts`, `src/scanner/iac-parser.ts`, `src/scanner/diagnostics.ts` — `buildFingerprint(...)`, `diagnose(fingerprint)`
- `src/api/events-client.ts` — `class AwsEventsClient` with live and fixture modes
- `src/auth/pkce.ts` — sign-in, `refresh`, `signOut`

If you need a symbol that does not exist yet, declare a narrow local interface in your own file. Do not import something imaginary.

## 1. `data/venues-transit.json`

Walk and shuttle matrix between The Venetian, Wynn | Encore, Caesars Forum, Caesars Palace, MGM Grand, Mandalay Bay. Realistic Las Vegas minutes. Each pair carries a `mode` of `walk` | `shuttle` | `rideshare`.

## 2. `src/solver/transit-guard.ts`

The **10-minute forfeiture rule**: an attendee loses a reserved seat 10 minutes before start.

- `requiredMinutes` = travel time + 10 minutes of safety.
- `checkTravel(prev, next): TravelCheck` returns the gap, the requirement, `ok`, and `forfeitureRisk`.
- Same venue: small buffer. Cross-Strip: shuttle time. An unknown pair: a conservative default, flagged in `note`.

## 3. `src/solver/scorer.ts`

- `scoreSession(session, fingerprint, gaps): ScoredSession`. Match on topics, services, level against `recommendedLevel`, and format.
- `buildPlan(catalog, fingerprint, gaps, schedule): SchedulePlan`:
  1. Interactive formats (Chalk Talk, Builders' Session, Workshop) with `availability.fullness === "full"` or `reservable === false` become `favorite-walk-up`.
  2. Recorded Breakout lectures become `favorite-watchlist`, to save transit time.
  3. Reserve the rest, highest score first.
  4. Respect existing `PersonalTime` anchors from the incoming schedule.
  5. Insert a daily 30-minute `Repo Architecture Synthesis` personal-time block.
  6. Resolve conflicts greedily by score. Never double-book a slot.
  7. Run `checkTravel` on every adjacent pair and drop a session whose `forfeitureRisk` cannot be avoided.
- There is NO seat count in this API. Use `fullness` and `reservable` only.
- Export `buildRemediation(gaps, plannedSessionIds): RemediationPlan`. Each gap becomes a ticket with `id`, `title`, `why`, `effort` of `S` | `M` | `L`, a CONCRETE `acceptanceTest` string, the `sessionIds` that address it, and `docLinks`. Tickets must be actionable, not restatements of the gap.

## 4. `src/config.ts`

Resolve paths under `~/.repo-invent/`. Read `GITHUB_TOKEN` and `REPO_INVENT_EVENT_ID` (default `reinvent2026`). Never hardcode a secret. Never log a token.

## 5. `src/mcp-server.ts`

A stdio MCP server with EXACTLY five tools:

| Tool | Input | Output |
|---|---|---|
| `scan_repository` | repo URL | `StackFingerprint` + gaps |
| `prescribe_reinvent_schedule` | repo URL | `PrescriptionPlan` |
| `apply_schedule_diff` | a plan | reserved + favourited, verified via `GetSchedule` |
| `export_remediation_plan` | a plan | `{ markdown, issues }` |
| `audit` | none | `ApiAuditReport` |

Use zod v4 schemas. Each tool returns JSON text content. `apply_schedule_diff` MUST refuse to write unless its input carries an explicit `confirm: true` flag.

## 6. `src/cli.ts`

The bin `repo-invent`:

```
repo-invent scan <repo-url> [--json]
repo-invent plan <repo-url> [--offline] [--json]
repo-invent login
repo-invent logout
repo-invent apply --file plan.json [--yes]
repo-invent export --file plan.json [--out dir]
repo-invent mcp
repo-invent audit
```

- `scan` and `plan` MUST work with NO sign-in. That is the 10-second judge demo.
- Only `apply` and schedule sync need auth. `apply` refuses without `--yes`.
- Exit non-zero on a typed failure, with a one-line message on stderr. Never print a token.

## Rules

Strict TS. No `any` unless a comment justifies it. Node builtins only, no new deps. Comments only where a non-obvious constraint needs explaining.

## Verify

```
cd /home/alex/.kiro/crew/workspace/repo-invent
npx tsc -p tsconfig.json --noEmit
```

Zero errors attributable to your files.

## Report back

Files created, the five MCP tools with their input schemas, every CLI command, and the tsc result.
