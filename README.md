# repo:Invent — AWS re:Invent 2026 Companion App, Architecture Scanner & MCP Agent

**re:Invent tells you what is new. `repo:Invent` tells you what your repository is missing—and plans your entire week in Las Vegas.**

Built for the **AWS re:Invent 2026 Event Catalog API Hackathon**, `repo:Invent` combines the full official AWS re:Invent mobile companion experience with static GitHub repository analysis, 10-minute seat forfeiture transit guards, 171 community & sponsor parties (`conferenceparties.com`), the live **AWS Events Remote MCP Server** (`https://api.awsevents.com/mcp`), and in-browser **WebMCP** (`navigator.modelContext`).

---

## Quick Start (`pnpm`)

```bash
git clone https://github.com/codercatdev/repo-invent.git
cd repo-invent
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | Description |
| --- | --- |
| `pnpm dev` | Starts the Next.js 16 (App Router + Turbopack) development server |
| `pnpm build` | Builds the production Next.js app + CLI/MCP TypeScript engine |
| `pnpm start` | Starts the production Next.js server |
| `pnpm test` | Runs the Vitest test suite (`43 passed`) |
| `pnpm cli login` | Runs OAuth 2.0 PKCE login with AWS Builder ID on `localhost:8484` |
| `pnpm mcp` | Starts the local stdio MCP server (`src/mcp-server.ts`) |

---

## Features & Screens

| Screen / Feature | What It Does | API & Data Surface |
| --- | --- | --- |
| **Home (`/`)** | Official AWS re:Invent 2026 header, Story cards carousel, dynamic seat alerts, **Scan GitHub Repo button right above Ask AWS**, Swipeable AI Recommendations (`✕` dismiss / `♥` favorite), and Quick Links | `/api/catalog`, `/api/scan`, `/api/favorite`, `/api/mcp` |
| **Session Catalog (`/catalog`)** | Full 2,476-session catalog with search, Filter sheet (Day, Level 100–500, Type, Venue, Track), quick chips (`All Day`, `Recommended`, `New launch`, `Open seats`), and collapsible Featured Experiences (`AWS Merch Store`, `Datadog Observaball`, `re:Invent SWAG`) | `ListSessions`, `GetSession` (`/api/catalog`) |
| **Your Calendar (`/calendar`)** | Month header + lavender `✦ Plan my day` pill, `Mon 30`–`Fri 4` day pills, `Hide Favorites` toggle, `+ Parties` overlay toggle, `05:30 AM`–`09:00 PM` hourly timeline grid, and floating `+` button for Personal Time blocks | `GetSchedule`, `CreatePersonalTime`, `DeletePersonalTime`, `DisassociateFavorite` |
| **171 Vegas Parties (`/parties`)** | All 171 vendor and community parties scraped from `conferenceparties.com/reinvent2026/` across 6 nights with sponsor tags, venue hubs, RSVP links, Google Maps links, and 1-click `+ Add to Calendar` | `/api/parties` (`data/parties.json`) |
| **More Menu (`☰`)** | Event switcher (`ListEvents` / `GetEvent`), Session Surveys & Reflections (rating ≥3★ closes repo architecture gaps), Builder ID PKCE status, Badge Pickup QR Code, Campus FAQs, Sponsors, and Disclosures | `/api/events`, `/api/session`, `/api/report` |
| **Floating MCP Agent (`✦`)** | Bottom-right purple sparkle Floating Action Button opens the live **MCP + WebMCP Assistant Drawer** with natural-language chat AND a 16-tool interactive MCP Inspector | `https://api.awsevents.com/mcp` + `navigator.modelContext` |

---

## MCP & WebMCP Integration

### 1. Remote AWS Events MCP Proxy (`/api/mcp`)
Connects directly to `https://api.awsevents.com/mcp` using `StreamableHTTPClientTransport` (`src/api/remote-mcp-bridge.ts`) and exposes all 12 official tools:
- `ListEvents`, `GetEvent`, `ListSessions`, `GetSession`, `GetSchedule`
- `ReserveSessions`, `CancelReservation`, `AssociateFavorites`, `DisassociateFavorite`
- `CreatePersonalTime`, `UpdatePersonalTime`, `DeletePersonalTime`

Plus 4 `repo:Invent` MCP tools:
- `scan_repository`, `search_sessions`, `search_parties`, `what_can_i_make`

### 2. Claude Code / Cursor MCP Registration
```bash
claude mcp add --transport http --scope user awsevents \
  https://api.awsevents.com/mcp \
  --callback-port 8484 --client-id 7vmom55m1qstvq8i71ph127bfq
```

### 3. Browser WebMCP (`navigator.modelContext` & `window.webMcp`)
On load, `lib/web-mcp.ts` registers our tools with the browser's `navigator.modelContext` API (`provideContext` / `registerTool`) and exposes `window.webMcp` so browser AI agents can invoke repository scans, catalog searches, party lookups, and schedule reads directly from the page.
