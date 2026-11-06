# I let re:Invent read my repository

A submission for the **AWS re:Invent 2026 Event Catalog API Hackathon**.

## The problem I actually had

Every re:Invent planner starts the same way: a form. Pick your level. Pick your topics. Pick the services you use.

I filled that form three years in a row and got the same answer every time: a list of talks about things I already knew, and a few about things I did not know I needed.

The form asks what you *think* you use. Your repository knows what you *actually* use.

So I built the other direction. Point `repo:Invent` at a public GitHub repository. It reads the manifests and the infrastructure-as-code, works out which AWS services that codebase runs and what it is missing, then plans a re:Invent week around closing those gaps. The plan becomes tickets, and every ticket has an acceptance test.

The week ends December 4. The tickets start the next Monday. That is the whole idea.

## What it does

| Step | What happens | Credentials |
| --- | --- | --- |
| 1 | Read a public repo over the GitHub API. No clone. | none |
| 2 | Detect services, IaC, compute, observability; rank architecture gaps with file evidence | none |
| 3 | Score the re:Invent catalog against those gaps and plan a walkable week | none |
| 4 | Export a Markdown plan and GitHub issue payloads | none |
| 5 | Reserve seats and favourite sessions, verified from `GetSchedule` | Builder ID |

Steps one to four need nothing. The demo answers in about ten seconds.

The site has a **"see the sample result"** button that scans a small order service bundled inside the app, so the full result appears even with GitHub rate-limited or offline. That sample has five real gaps on purpose, and its files ship with the code so anyone can check the diagnosis against them.

## Reading a repository without cloning it

Five to fifteen HTTP calls:

1. `GET /repos/{owner}/{repo}` for the default branch and languages.
2. `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1` for the file tree.
3. `GET /repos/{owner}/{repo}/contents/{path}` for a ranked subset.

Hard caps, enforced in code: 40 files, 300 KB total, 100 KB each. Manifests rank above documentation, and a file name that repeats across folders collapses to one representative, because a service-per-folder repository has twenty identical `requirements.txt` files and one `template.yaml` that describes everything.

That cap turned out to matter. The first version spent its whole budget on documentation proofs and never reached a single dependency manifest. A test now pins the ordering.

## Diagnosing gaps

Six rules, each requiring evidence from a file that was actually read:

| Gap | Fires when |
| --- | --- |
| Agent stack with no orchestration | MCP or Bedrock present, no Step Functions |
| DynamoDB with no resilience | DynamoDB, no Streams, no DAX, no DLQ |
| Compute with no tracing | Lambda/ECS/EKS, no OpenTelemetry |
| No queue isolation | Three or more services, no SQS or SNS |
| Public API with no WAF | A web framework, no WAF or throttle |
| Wildcard IAM | A policy with a wildcard action |

A repository too small to support a claim produces no gap. Inventing a diagnosis is worse than finding nothing.

## The API details that shaped the code

I read the OpenAPI document and the docs, then checked every assumption against 2,476 live sessions. Almost every one of my first assumptions was wrong.

| What I assumed | What the catalog does |
| --- | --- |
| Sessions have `start` and `end` | They carry `sessionTime: {date, time, length}`, and the end is computed |
| `level` is a number | It is prose: `"300 – Advanced"` |
| Types are `"Chalk Talk"` | They are `"Chalk talk"`, and there is no `Launch Session` at all |
| The list holds sessions | It also holds `Lactation room`, `Game Night` and `re:Play` |
| Services say `"DynamoDB"` | They say `"Amazon DynamoDB"` |
| `isReservable` is a hint | It is the only availability signal there is: 1,482 of 2,476 are reservable |
| Bulk writes return a list | They return `{result: {successful, failed}}`, at most ten ids per request |
| `GetSchedule` returns arrays | It returns `{schedule: {reserved, favorites, personalTime}}`, as bare session ids |
| A session id is unique | 488 titles appear under different ids as re-runs |

That last table is most of the engineering. The API is honest and well documented, but the documentation describes shapes, and the catalog has data.

Two more things the docs state plainly and the code respects:

- **No idempotency key.** After an unknown write outcome, re-read `GetSchedule` and send only what is missing.
- **A `200` is not success.** Both bulk writes succeed or fail per session. A session already reserved reports as a failure.

I found this the hard way. My first apply reported `Favourited: 5/5` while `GetSchedule` showed zero, because I was reading the wrong level of the response. That is exactly the false success the AWS docs warn about, and I had written it.

## Planning a week you can walk

A reserved seat is released ten minutes before a session starts. So a transfer between venues needs travel time **plus ten minutes**, not travel alone.

The planner scores each session against the diagnosed gaps, the services the repo already runs, and the recommended level. Then it resolves the week greedily and checks every adjacency against that rule.

An early version had a real bug: it compared each candidate against the last session *added*, rather than the last session *by clock*. Score order and time order differ, so it produced negative gaps and dropped good talks. A test now asserts no two planned sessions overlap.

Three behaviours follow from the data:

- **Interactive formats** that are full or not reservable go to a **walk-up queue** as favourites.
- **Recorded lectures** go to a **watchlist**, because watching later beats crossing the Strip.
- **One 30-minute synthesis block per day** is protected as personal time.

## What I added after studying the other entries

Nine submissions were public before the deadline. I read all nine READMEs and wrote the comparison up as `docs/competitive-analysis.md`. The honest summary:

| Capability | How many of the nine have it |
| --- | --- |
| Catalog search and a conflict-free plan | 9 of 9 |
| Reserve and favourite through the API | 8 of 9 |
| Travel time between venues | 6 of 9 |
| MCP server | 6 of 9 |
| Gap analysis from a described profile | 2 of 9 |
| Reflections after each session | 1 of 9 |
| **Gap analysis from a repository** | **0 of 9** |
| **Gaps become tickets with tests** | **0 of 9** |

So the repository scan is the differentiator, and it is a narrow one. Pathfinder, in particular, does gap discovery from a profile, plus reflections and an executive report.

I built four features because of that reading:

1. **Availability heatmap** — the catalog by venue, day and slot, coloured by what the API says about seats.
2. **Reflections** — rate a session; the gaps it was planned for close. A rating below three does not close anything, because sitting in a room is not learning.
3. **A take-home report** — one self-contained HTML page with the gaps, the tickets, and the week. No scripts, print styles, safe for mailing.
4. **`what-can-i-make`** — "it is Tuesday 12:40 and I am at MGM Grand; what can I still get to?" Same ten-minute rule, same transit matrix.

I deliberately did not build seat autopilot, a squad consensus protocol, or a RAG chat over the catalog. Two other entries do each of those properly, and a copy would score nothing for novelty.

## What broke, and what it taught me

Everything below was found by running against the live API, not by reading.

| Bug | How it showed up |
| --- | --- |
| Wrong redirect port | `8976` is registered for installed MCP clients only; a self-built app gets `8484`–`8489` |
| Docs ranked above manifests | Zero services found in a repo full of AWS SDK clients |
| Type names unmatched | Every session parsed as `Breakout` |
| Non-sessions scheduled | A lactation room appeared in the week plan |
| Negative travel gaps | Six good talks dropped by a comparison against the wrong neighbour |
| Same talk booked twice | 488 titles repeat under different ids |
| Schedule read at the wrong level | `5/5 favourited`, read back as zero |

The last one is the one I would put in the article even if nothing else survived. A tool that reports success it cannot verify is worse than a tool that fails.

## Running it

```bash
git clone <repo>
cd repo-invent
npm install && npm run build

# no credentials
node dist/cli.js scan https://github.com/aws-samples/aws-serverless-ecommerce-platform
node dist/cli.js plan https://github.com/aws-samples/aws-serverless-ecommerce-platform --offline

# live catalog
node dist/cli.js login
node dist/cli.js plan https://github.com/your/repo --out ./out

# the site
npm run web        # http://127.0.0.1:8080
```

Five MCP tools on stdio: `scan_repository`, `prescribe_reinvent_schedule`, `apply_schedule_diff`, `export_remediation_plan`, `audit`. The apply tool refuses to write unless it is given `confirm: true`.

47 tests, no network in any of them.

## What I would build next

The honest gap in my own work is that the scan reads a snapshot. A real version would read recent commits, because a service added last week says more about where a team is going than one added two years ago. That is the first thing I would add, and it is why the scanner takes a `ref` and keeps the tree walk cheap.

The second is the closing loop: the report should be able to open the issues, not just produce the payloads.

## What this is

re:Invent tells you what is new. **repo:Invent tells you what your repo is missing**, plans the week that closes it, and leaves you with tickets that outlive the conference.

Code: see the repository link on this project.
Demo: see the project description.
