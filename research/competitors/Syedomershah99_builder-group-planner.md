# Builder Group Planner

Group layer on top of the AWS re:Invent event catalog. Community Builders travel
to re:Invent in clusters, but coordinating is chaos: nobody knows which sessions
their people are in, and finding a time when the whole group is free turns into a
200-message chat thread. This app computes, for a group:

1. **Shared sessions**: sessions that 2 or more members favorited or reserved,
   so you know where your people will be ("3 of your group are in this session").
2. **Meetup slots**: windows where every member is free, ranked by length and
   time of day, with one-click "block this time" that writes a personal-time
   block to each member's calendar through the API.
3. **Group picks**: high-interest sessions matching the group's shared topics
   that nobody has reserved yet, with one-click seat reservation for the whole
   group.

## Honest design point (read this first)

The Events API exposes each attendee's own calendar only. There is no endpoint
that returns another attendee's schedule. Group features therefore require every
member to connect and share their calendar with the group. The demo ships with
seeded sample members, and any Community Builder can join a group by connecting
their own token. No real attendee calendar is included in this repo.

## How it uses the API

- REST API at `https://api.awsevents.com` (all paths under `/v1`, JSON):
  `ListEvents`, `ListSessions` (paged with `nextToken`), `GetSession`,
  `GetSchedule` (reserved, favorites, personal time), `ReserveSessions`,
  `CancelReservation`, `AssociateFavorites`, `CreatePersonalTime`,
  `UpdatePersonalTime`, `DeletePersonalTime`.
- Write operations are the technical-depth story: the tool does not just display
  data, it acts on every member's calendar with their consent. Bulk calls
  (`ReserveSessions`, `AssociateFavorites`) can succeed per session, so the app
  always reads `result.failed` and reports per-session codes (for example
  `scheduleConflict`, `sessionFull`, `alreadyScheduled`).
- Personal-time blocks follow the API's rules exactly: wall-clock time in the
  event timezone (`YYYY-MM-DDTHH:MM:SS`, seconds `00`), same date (no midnight
  crossing), length a whole number of 5-minute increments. The app validates
  locally before sending.
- MCP server: the AWS-hosted server at `https://api.awsevents.com/mcp` exposes
  the same operations as tools (`ListEvents`, `ListSessions`, `GetSchedule`,
  `ReserveSessions`, `CreatePersonalTime`, and the rest). The app's agent layer
  (`public/agent.js`) answers plain-language questions ("When can my whole
  group meet on 2026-12-01?") with the same engine the UI uses, and names the
  MCP tool each answer maps to. The app works with the hosted MCP server; it
  does not reimplement it.

## Run it

Requirements: Node 18 or newer. No dependencies, no build step.

```bash
node server.js
# open http://localhost:3000/
```

Demo mode works immediately with sample members. Try the agent question box,
the meetup slots for 2026-12-01, and the group picks.

```bash
npm test   # 12 engine tests, no dependencies
npm run demo  # prints the three group views over the sample group
```

## Live mode (your real re:Invent week)

1. Get an attendee token (PKCE, Builder ID sign-in, no client secret):
   ```bash
   node auth.js
   # open the printed URL, sign in, then:
   node auth.js --code <code> --verifier <verifier>
   ```
   Tokens print to the terminal only. This script never writes tokens to a
   file. Access tokens last 60 minutes, refresh tokens 30 days.
2. In the app, switch to Live mode, set the event ID (`reinvent2026`), paste
   each member's token, and click "Load live schedules". The app fetches each
   member's `GetSchedule` and the full session catalog, then computes the same
   three views.
3. "Block this time" calls `CreatePersonalTime` per member. "Reserve for group"
   calls `ReserveSessions` per member and reports per-member results, including
   failures.
4. If the browser blocks direct calls to `api.awsevents.com`, restart with the
   local proxy: `PROXY=1 node server.js`, then tick "Use local proxy" in the
   app. The proxy forwards only to `api.awsevents.com`, only for `/v1/` paths,
   and never stores or logs tokens.

## Project layout

- `public/engine.js`: group math (shared sessions, free-slot intersection,
  group picks, personal-time validation). Shared by browser and tests.
- `public/api.js`: thin Events API client (direct or proxy mode).
- `public/demo-data.js`: sample group and catalog, clearly labeled.
- `public/agent.js`: plain-language questions mapped to engine plus MCP tools.
- `public/index.html`, `public/app.js`: single-page UI.
- `server.js`: static server plus optional local proxy.
- `auth.js`: PKCE sign-in helper.
- `test/engine.test.js`: 12 tests.
- `docs/api-notes.md`: endpoint and auth reference used to build the client.
- `docs/hosting-plan.md`: static hosting plan sized to the AWS credits
  available, plus the ready-to-run deploy script.

## Judging map

- Creativity: a group layer on top of a personal catalog API. Most entries will
  be single-user planners.
- Utility: solves a real, felt problem for the exact audience attending
  (Builders and Heroes coordinate constantly).
- Technical depth: read plus write across multiple accounts, MCP agent
  surface, calendar interval computation, per-session bulk result handling.
- Project quality: clean README, working demo, honest limits stated above.

## Status and limits

- Live mode verified read-only on Oct 25, 2026 against a real attendee token:
  after sign-in, GetSchedule for reinvent2026 returned the signed-in user's
  real schedule with favorites and approval status. Nothing was reserved or
  changed. The demo, the engine tests, and the server are also verified.
  Access tokens are not retained; a future live call needs a fresh sign-in.
- The app handles one event at a time and one group at a time. Group codes and
  multi-group persistence are future work, not claimed here.
- No em dashes were used in this repo, per the author's standing rule.
