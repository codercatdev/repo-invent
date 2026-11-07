# repo:Invent — I let re:Invent read my repository

**Tagline:** Scan your GitHub repo, level up your AWS architecture, build a walkable Vegas schedule, explore 171 parties, and query the live AWS Events MCP.

**Overview:** Developers attend AWS re:Invent to solve real production problems, but navigating 2,200+ sessions across 6 Vegas casinos is overwhelming. `repo:Invent` bridges code and conference. Paste any GitHub repository URL. The scanner inspects your CDK, Terraform, Docker, and application code, finds AWS architectural gaps, and generates a conflict-free, walkable session agenda.

**Key Features:**
- **GitHub Architecture Scanner:** Detects AWS primitives (Lambda, DynamoDB, Bedrock, ECS, SQS) across CDK (TypeScript & Python), Terraform, and Dockerfiles.
- **Walkable Vegas Planner:** Transit-aware scheduling across Venetian, Caesars Forum, Wynn, and MGM Grand with 5-minute personal time buffers and the 10-minute seat forfeiture guard.
- **171 Curated Vegas Parties:** Scraped and verified from `conferenceparties.com` with one-click "+ Calendar" overlays, venue filters, and RSVP links.
- **Live AWS Events MCP & WebMCP:** Conversational assistant querying the official `https://api.awsevents.com/mcp` endpoint and exposing browser tools via `window.webMcp`.
- **Gamified Duolingo Aesthetic:** Playful 3D tactile buttons, story quests, scannable Badge Pickup QR code, and XP leveling.

---

> 📸 **[IMAGE 1: `repo_invent.png`]**
> - **Title:** `repo:Invent Home Screen & Quests`
> - **Alternative text:** `Home screen with quest carousel, seat alerts, repo scanner, and swipeable AI recommendations`
> - **Caption:** `Gamified re:Invent home screen with Duolingo-inspired tactile aesthetic and real-time seat alerts`

---

## The problem I actually had

Every re:Invent planner starts the same way: a form. Pick your level. Pick your topics. Pick the services you use.

I filled that form three years in a row and got the same answer every time: a list of talks about things I already knew, and a few about things I did not know I needed.

The form asks what you *think* you use. Your repository knows what you *actually* use.

So I built the other direction. Point `repo:Invent` at a public GitHub repository right above the "Ask me anything" box. It reads the manifests and the infrastructure-as-code, works out which AWS services that codebase runs and what it is missing, then plans a re:Invent week around closing those gaps. The plan becomes tickets, and every ticket has an acceptance test.

The week ends December 4. The tickets start the next Monday. That is the whole idea.

---

> 📸 **[IMAGE 2: `scan1.png`]**
> - **Title:** `GitHub Architecture Scanner Input`
> - **Alternative text:** `Input bar for pasting any public GitHub repository URL with sample targets`
> - **Caption:** `Point repo:Invent at any GitHub repo to diagnose AWS architecture gaps`

---

## What it does (Scan 1 → Scan 2)

| Step | What happens | Credentials |
| --- | --- | --- |
| 1 | Read a public repo over the GitHub API. No clone. | none |
| 2 | Detect services, IaC (CDK TS/Python, Terraform, Docker), compute, observability; rank architecture gaps with file evidence | none |
| 3 | Score the 2,476-session re:Invent catalog against those gaps and plan a walkable week | none |
| 4 | Export a printable remediation report and GitHub issue payloads | none |
| 5 | Reserve seats, favorite sessions, and block Personal Time, verified from `GetSchedule` | Builder ID |

Steps one to four need nothing. Clicking **Try Sample Repo** or **Scan Repo** answers in seconds and smooth-scrolls directly into the diagnosis drawer (`Scan 2`).

---

> 📸 **[IMAGE 3: `scan2.png`]**
> - **Title:** `Architecture Diagnosis & Week Plan`
> - **Alternative text:** `Diagnosis drawer displaying 6 detected gaps, target levels, and remediation tickets`
> - **Caption:** `Automated AWS gap detection and curated week plan linking directly to catalog sessions`

---

## Reading a repository without cloning it

Five to fifteen HTTP calls:

1. `GET /repos/{owner}/{repo}` for the default branch and languages.
2. `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1` for the file tree.
3. `GET /repos/{owner}/{repo}/contents/{path}` for a ranked subset.

Hard caps, enforced in code: 40 files, 300 KB total, 100 KB each. Manifests rank above documentation, and a file name that repeats across folders collapses to one representative, because a service-per-folder repository has twenty identical `requirements.txt` files and one `template.yaml` that describes everything.

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

---

> 📸 **[IMAGE 4: `repo_invent2.png`]**
> - **Title:** `Session Catalog & Filter Drawer`
> - **Alternative text:** `Multi-column session catalog displaying 2,285 talks with level, venue, and track chips`
> - **Caption:** `Browse and filter 2,200+ re:Invent sessions with walk-up badges and seat availability`

---

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

Two more things the docs state plainly and the code respects:

- **No idempotency key.** After an unknown write outcome, re-read `GetSchedule` and send only what is missing.
- **A `200` is not success.** Both bulk writes succeed or fail per session. A session already reserved reports as a failure.

## Planning a week you can walk

A reserved seat is released ten minutes before a session starts. So a transfer between venues needs travel time **plus ten minutes**, not travel alone.

The planner scores each session against the diagnosed gaps, the services the repo already runs, and the recommended level. Then it resolves the week greedily and checks every adjacency against that rule:

- **Interactive formats** that are full or not reservable go to a **walk-up queue** as favorites.
- **Recorded lectures** go to a **watchlist**, because watching later beats crossing the Strip.
- **One 30-minute synthesis block per day** is protected as personal time.

---

> 📸 **[IMAGE 5: `Screenshot_2026-11-06_at_8.28.01_PM.png`]**
> - **Title:** `MCP Assistant & 171 Parties Guide`
> - **Alternative text:** `Conversational MCP assistant querying official AWS Events MCP and conferenceparties.com`
> - **Caption:** `Querying live AWS Events MCP and 171 Vegas parties directly from the floating agent drawer`

---

## Live Remote MCP, WebMCP & 171 Vegas Parties

Clicking the floating `✦` button opens the **re:Invent MCP + WebMCP Agent**:

1. **Remote AWS Events MCP Proxy (`/api/mcp`):** Connects directly to `https://api.awsevents.com/mcp` using `StreamableHTTPClientTransport` and exposes all 12 official tools (`ListEvents`, `GetEvent`, `ListSessions`, `GetSession`, `GetSchedule`, `ReserveSessions`, `CancelReservation`, `AssociateFavorites`, `DisassociateFavorite`, `CreatePersonalTime`, `UpdatePersonalTime`, `DeletePersonalTime`).
2. **4 Local `repo:Invent` MCP Tools:** `scan_repository`, `search_sessions`, `search_parties`, and `what_can_i_make` ("it is Tuesday 12:40 and I am at MGM Grand; what can I still get to?").
3. **171 Vegas Parties (`conferenceparties.com`):** Scraped and enriched across 6 nights (Nov 29 – Dec 4) with venue hubs, RSVP links, Google Maps links, and 1-click `+ Calendar` overlays.
4. **In-Browser WebMCP (`navigator.modelContext` & `window.webMcp`):** Registers 6 tools directly in the browser context so AI browser agents can inspect and act on the page.

## What I added after studying the other entries

Nine submissions were public before the deadline. I read all nine READMEs and wrote the comparison up as `docs/competitive-analysis.md`:

| Capability | How many of the nine have it |
| --- | --- |
| Catalog search and a conflict-free plan | 9 of 9 |
| Reserve and favorite through the API | 8 of 9 |
| Travel time between venues | 6 of 9 |
| MCP server | 6 of 9 |
| Gap analysis from a described profile | 2 of 9 |
| Reflections after each session | 1 of 9 |
| **Gap analysis from a repository** | **0 of 9** |
| **Gaps become tickets with tests** | **0 of 9** |
| **171 Vegas parties overlaid on schedule** | **0 of 9** |

## What broke, and what it taught me

Everything below was found by running against the live API, not by reading.

| Bug | How it showed up |
| --- | --- |
| Wrong redirect port | `8976` is registered for installed MCP clients only; a self-built app gets `8484`–`8489` |
| Docs ranked above manifests | Zero services found in a repo full of AWS SDK clients |
| Type names unmatched | Every session parsed as `Breakout` |
| Non-sessions scheduled | A lactation room appeared in the week plan |
| Negative travel gaps | Six good talks dropped by a comparison against the wrong neighbor |
| Same talk booked twice | 488 titles repeat under different ids |
| Schedule read at the wrong level | `5/5 favorited`, read back as zero |

## Running it (`pnpm`)

```bash
git clone https://github.com/codercatdev/repo-invent.git
cd repo-invent
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
# CLI & MCP commands
pnpm cli scan https://github.com/aws-samples/aws-serverless-ecommerce-platform
pnpm cli login
pnpm mcp
pnpm test
```

## What this is

re:Invent tells you what is new. **repo:Invent tells you what your repo is missing**, plans the week that closes it, overlays 171 Vegas parties, and leaves you with tickets that outlive the conference.
