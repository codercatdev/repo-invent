# Competitive analysis: nine re:Invent hackathon entries

Read on 2026-11-06 from each project's published README. Every claim below
names its source project.

## The field

| Project | What it is | Stack |
|---|---|---|
| **re:Seat** (hsiddhu2) | Watches for freed seats, swaps safely, autopilot rules file, phone remote via ntfy | Local, Node |
| **Junction** (codecr) | Squad coordination: signed session-code manifests, deterministic consensus | Node local agent + CDK relay |
| **re:Invent planner agent** (manumaan) | Plain-language goals → schedule, RAG over catalog, Bedrock Titan embeddings | Python, uv, CDK, S3 Vectors |
| **Session Roadie** (yosimitu) | CLI + MCP, "desired state" file, apply, quota discipline | Node, Japanese docs |
| **re:Invent Sniper** (Harivelu0) | Find/plan/book with Must/Nice/Backup, live booking at open, email confirm | Node |
| **re:Invent Commander** (niklaswesterstrahle) | Two-panel TUI-ish web, folder-tree nav, keyboard-first, Fastify token vault | Fastify local |
| **Pathfinder** (Trycatch-tv) | Repo-ish profile → gaps → adaptive learning path + reflections + exec report | Web app |
| **replan** (awsfanboy) | Event-week co-pilot, MCP, YAML, simulate week changes, terminal + browser | Node, YAML |
| **Builder Group Planner** (Syedomershah99) | Group layer, find a free time for everyone, book together | Next.js local |

## Feature frequency across all nine

| Capability | Count | Who |
|---|---|---|
| Full catalog walk + local cache + search | 9/9 | all |
| Plan a conflict-free week | 9/9 | all |
| Reserve / favourite through the API | 8/9 | all but Pathfinder-lite |
| Travel time between venues | 6/9 | re:Seat, Junction, planner agent, replan, Sniper, Roadie |
| Local-only, token never leaves machine | 7/9 | re:Seat, Junction, Roadie, Commander, replan, Pathfinder, Sniper |
| MCP server | 6/9 | Junction, Roadie, replan, planner agent, Sniper, Pathfinder |
| Walk-up handling for non-reservable | 3/9 | replan, re:Seat, Sniper |
| Personal time as anchors | 3/9 | replan, Roadie, Pathfinder |
| Gap analysis from a stated profile | 2/9 | Pathfinder, planner agent |
| Reflect / learn after each session | 1/9 | Pathfinder |
| Executive / ROI report | 1/9 | Pathfinder |
| **Repo scan for gaps** | **0/9** | **nobody** |
| **Gap → ticket with acceptance test** | **0/9** | **nobody** |
| Safe swap with rollback | 1/9 | re:Seat |
| Autopilot rules file | 1/9 | re:Seat |
| Phone remote / push approval | 1/9 | re:Seat |
| Squad consensus among attendees | 2/9 | Junction, Group Planner |
| Simulate "what can I still make" at 12:40 | 1/9 | replan |
| Multi-language summaries | 0/9 here (YukiOgawa had it) | — |
| Availability heatmap by venue and slot | 1/9 | Pathfinder |

## What Pathfinder actually took from us

Pathfinder's README describes gap discovery from a profile plus relevance
tiers. That is the closest idea to ours. Two differences still hold:

1. **Input.** Pathfinder asks the user to describe their project. We read the
   repository. A description is a guess; a manifest is evidence.
2. **Output.** Pathfinder ends at a learning path and a report. We end at
   tickets with acceptance tests that outlive the week.

Neither gap is safe forever. Anyone can add repo reading in a day.

## The five highest-value features to build next

Ranked by "does another entry have it, and would a judge notice".

| # | Feature | Who has it | Why it lifts our score |
|---|---|---|---|
| 1 | **Availability heatmap** — grid by day, slot, venue, coloured by reservable state | Pathfinder | Every judge compares planners side by side; a table of text looks poor next to this |
| 2 | **Reflect after a session** — rate, notes, action item; gaps re-rank | Pathfinder | Turns a one-shot plan into a loop, which is our whole story |
| 3 | **ROI / closing report** — gaps closed, time spent, what is left | Pathfinder | The take-home artifact a judge can picture themselves sharing |
| 4 | **Squad layer** — share a plan without sharing accounts | Junction, Group Planner | Teams are half the audience; Junction proved the design can be small |
| 5 | **Simulate mid-week** — "it is Tuesday 12:40, I am at MGM; what can I still make?" | replan | Cheap to add: we already have the transit matrix and the catalog |

Also worth a day each, and absent from most of the field:

- **Walk-up and watchlist tags shown in the UI** (we have the logic, not the surface)
- **Quota discipline visible** — a status line showing remaining calls per operation
- **`--json` everywhere** so an agent can drive the CLI

## What we should NOT copy

| Temptation | Why not |
|---|---|
| Live seat autopilot | re:Seat and Sniper both did it well; catching up scores 0 for novelty |
| Squad consensus protocol | Junction's signed-manifest design is deep; a thin copy reads as derivative |
| Phone push remote | re:Seat owns this; it needs ntfy and hours of testing |
| RAG chat over the catalog | planner agent did Bedrock Titan + S3 Vectors properly; ours would be worse |

## Our position, stated in one line

> Every other entry helps you attend better. **repo:Invent tells you what to change in your code afterwards**, and every gap it finds becomes a ticket with a test that proves it was closed.

That sentence is the article title, the demo opening, and the thing we must
never let a new feature blur.

## Milestones

### M0 — shipped (done)

- [x] Twelve API operations, live catalog walk (2,271 sessions)
- [x] PKCE sign-in against AWS Builder ID, verified live
- [x] Real writes: 5 favourites written and read back from `GetSchedule`
- [x] Public repo scan with caps, cache, timeout, honest failure kinds
- [x] Six gap rules with file evidence
- [x] Walkable week with the ten-minute forfeiture rule
- [x] Tickets with acceptance tests, Markdown export, issue payloads
- [x] Plan diff, CLI, MCP server
- [x] Web demo, deployed on a Lambda Function URL
- [x] 31 tests, typecheck clean

### M1 — make the page look like a product (2 hours)

- [ ] Availability heatmap grid, coloured by reservable state, grouped by venue
- [ ] Gap severity colouring with a count badge
- [ ] "Days until re:Invent" and the event window in the header
- [ ] Empty-state copy for a repo with no gaps
- [ ] Lighthouse pass: no console errors, readable at 375px

### M2 — close the loop (3 hours)

- [ ] `POST /api/reflect` records a rating and note for a session id
- [ ] Reflection re-ranks the remaining gaps
- [ ] "Progress" panel: gaps closed / open
- [ ] Store per session in the browser (no server state needed)
- [ ] Export: markdown of what was learned

### M3 — the report that travels (2 hours)

- [ ] `GET /api/report` returns the plan as a single self-contained HTML page
- [ ] Include: repo name, gaps, tickets, schedule, remaining work
- [ ] Shareable link or a downloadable file
- [ ] Print stylesheet

### M4 — small wins (2 hours)

- [ ] Quota status line in the CLI and the page
- [ ] `--json` on every command (already true; verify and document)
- [ ] Watched sessions marked "recorded" in the schedule table
- [ ] Simulate: `repo-invent what-can-i-make --at "2026-12-01T12:40" --venue "MGM Grand"`

### Order if time is short

M1 heatmap first. It is the most visible delta against Pathfinder. Then M3
report, because it is the article's screenshot. M2 last, since reflections
need a live event to feel real.

## How to build it

Each milestone is one subagent task with a file list, run in parallel only where
the file sets do not overlap. The conductor reviews, runs `npm test` and
`npm run typecheck`, then commits.

| Milestone | Owned files |
|---|---|
| M1 | `web/index.html`, `src/web.ts` |
| M2 | `web/index.html`, `src/reflect.ts` |
| M3 | `src/report.ts`, `src/lambda.ts` |
| M4 | `src/cli.ts`, `src/solver/scorer.ts` |
