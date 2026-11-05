# Subagent 4: Remediation Export & Plan Diff

You are Subagent 4. You own the differentiator: the thing that outlives re:Invent week.

PROJECT: `/home/alex/.kiro/crew/workspace/repo-invent`
TypeScript. NodeNext ESM. `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

FIRST read:
- `/home/alex/.kiro/crew/workspace/repo-invent/src/types.ts`
- `/home/alex/.kiro/crew/workspace/repo-invent/docs/api-research.md`

## You own exactly these files. Create only these.

- `src/export/markdown.ts`
- `src/export/github-issues.ts`
- `src/export/plan-diff.ts`
- `src/export/index.ts`

Do not touch `package.json`, `tsconfig.json`, or `src/types.ts`.
If a type is missing, fit what exists and report the gap. Never edit the shared types.

## Assume these exist (another agent writes them; import, do not create)

- `../types.js` — `RemediationPlan`, `RemediationTicket`, `SchedulePlan`, `ScheduleItem`, `ArchitecturalGap`, `PlanningDay`, `PlanAction`
- `../solver/scorer.js` — `buildRemediation(...)`
- `../api/events-client.js` — `AwsEventsClient`

If you need a symbol that does not exist, define a narrow local interface in your own file.
Do not import something imaginary.

## 1. `src/export/markdown.ts`

`renderRemediationMarkdown(plan: RemediationPlan, schedule: SchedulePlan): string`

Output a single Markdown document titled with the repo name. Sections, in order:

1. A one-paragraph summary: how many gaps, how many tickets, how many sessions.
2. A table: gap id, severity, ticket id, effort.
3. One section per ticket, with: title, why, effort, the sessions that address it (title plus date), the AWS doc links, and the acceptance test as a fenced checklist item.
4. A schedule appendix: one table per day, columns time, title, venue, action tag.
5. A footer stating the data source: `live` or `fixture`.

Rules:
- Deterministic output. Same input, same bytes. Sort tickets by severity then id.
- No trailing whitespace. One blank line between blocks.
- Escape pipe characters in table cells.
- Never print a token, a session cookie, or a personal time entry id.

## 2. `src/export/github-issues.ts`

`renderIssueDrafts(plan: RemediationPlan): IssueDraft[]`

`IssueDraft` is a local interface you declare: `{ title, body, labels: string[], milestone?: string }`.

- One draft per ticket. Title is the ticket title prefixed `[re:Invent]`.
- Body is a short why, the acceptance test, the session links, and the AWS doc links.
- Labels: `re:invent-remediation`, the severity, and each tagged service lowercased.
- `milestone` is the effort bucket: `S`, `M`, or `L`.
- Also export `issuesToJson(drafts): string` that produces a JSON array matching the shape GitHub's `POST /repos/{owner}/{repo}/issues` accepts per item (`title`, `body`, `labels`). Include a comment naming the endpoint.

Do NOT call the GitHub API. You only produce payloads. Say so in a comment.

## 3. `src/export/plan-diff.ts`

`diffPlans(current: SchedulePlan, proposed: SchedulePlan): PlanDiff`

`PlanDiff` is a local interface: `{ added: ScheduleItem[]; removed: ScheduleItem[]; moved: Array<{ from: ScheduleItem; to: ScheduleItem }>; unchanged: ScheduleItem[] }`.

- Identity is `sessionId` when present, else `title` plus `start`.
- `moved` means same identity, different `start` or `venue`.
- Sort every bucket deterministically by start then title.
- Export `renderPlanDiff(diff): string` producing a unified-diff-style text body using `-` for removed and `+` for added lines, with an `@@` header per day. This is the "review before apply" surface, so it must read like a real diff.

## 4. `src/export/index.ts`

Re-export the four public functions and the two local interfaces. No logic.

## Rules

- Strict TS. No `any` unless a comment justifies it.
- No new npm dependencies. Node builtins only.
- Comments only where a non-obvious constraint needs explaining.
- Pure functions. No filesystem writes, no network.
- Every exported function must tolerate empty input (`[]`) without throwing.

## Verify

```
cd /home/alex/.kiro/crew/workspace/repo-invent
npx tsc -p tsconfig.json --noEmit
```

Zero errors attributable to your files.

## Report back

Files created, each exported symbol with its signature, the exact `PlanDiff` and `IssueDraft` shapes you settled on, and the tsc result.
