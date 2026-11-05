# Subagent 1: Auth & AWS Events API

PROJECT: `/home/alex/.kiro/crew/workspace/repo-invent`
TypeScript, NodeNext ESM, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
Deps already installed: zod v4, `@modelcontextprotocol/sdk` v1.32.

FIRST read, in this order:
1. `/home/alex/.kiro/crew/workspace/repo-invent/docs/api-research.md` — AUTHORITATIVE
2. `/home/alex/.kiro/crew/workspace/repo-invent/src/types.ts`

Where this file and the research doc disagree, THE DOC WINS.

## You own exactly these files. Create only these.

- `src/auth/pkce.ts`
- `src/api/events-client.ts`
- `src/api/remote-mcp-bridge.ts`
- `data/mock-reinvent2026.json`

Do not touch `package.json`, `tsconfig.json`, `src/types.ts`, or any file another agent owns.

## 1. `src/auth/pkce.ts` — OAuth 2.0 authorization code + PKCE, AWS Builder ID

Endpoints:
- Authorize `https://oauth.awsevents.com/oauth2/authorize` — always send `identity_provider=AWSBuilderID`
- Token `https://oauth.awsevents.com/oauth2/token`
- Revoke `https://oauth.awsevents.com/oauth2/revoke`
- `client_id` `7vmom55m1qstvq8i71ph127bfq`
- scope `openid email events/access`

CRITICAL redirect rule: `redirect_uri` MUST be `http://localhost:PORT/callback` where PORT is one of **8484–8489 only**. Pick the first free port in that range. Match is exact, no wildcards. Port `8976` FAILS — it is only registered for installed MCP clients, not for a self-built app.

- `code_verifier`: 43–128 chars from the unreserved set, fresh per attempt, from `crypto.randomBytes`.
- `code_challenge` = base64url of SHA-256 of the verifier, no padding. Send `code_challenge_method=S256` explicitly.
- Random `state`, stored with the verifier, verified on callback. Mismatch throws.
- Local `http` server on `127.0.0.1:PORT` handling `GET /callback`. Close after one code or a 5-minute timeout.
- Tokens at `~/.repo-invent/tokens.json`, directory `0700`, file `0600`.
- Schedule refresh from the response `expires_in` (60 min access). NEVER a hardcoded constant. Persist the rotated refresh token when present.
- `refresh()`: treat 401 as refresh-once-then-retry. A second 401 means the refresh token is dead — require interactive sign-in, do not loop.
- `signOut()`: POST revoke with the refresh token, then delete the file.
- Node builtins only for crypto and http. No new deps.

## 2. `src/api/events-client.ts` — class `AwsEventsClient`, all 12 REST operations

ListEvents, GetEvent, ListSessions, GetSession, GetSchedule, ReserveSessions, CancelReservation, AssociateFavorites, DisassociateFavorite, CreatePersonalTime, UpdatePersonalTime, DeletePersonalTime.

- Base `https://api.awsevents.com/v1`. Types from `../types.js`.
- Two modes: `live` (bearer token) and `fixture` (reads `data/mock-reinvent2026.json`). In fixture mode `Catalog.source` MUST be `"fixture"`. Never present fixture data as live.
- Error handling, exactly:
  - `401` — refresh once, retry
  - `403` with a JSON body — signed in but NOT registered for the event. Throw a named `NotRegisteredError`. Never retry. Signing in again does not help.
  - `403` with an EMPTY body — edge refusal. Back off, retry.
  - `404` — gone. For deletes, treat as already done.
  - `409` — operation closed. Throw a named `OperationClosedError`.
  - `429` — wait `Retry-After`, then retry.
  - `500`/`503` — reads backoff. Writes must reconcile from `GetSchedule`.
- There is NO idempotency key. After an unknown write outcome, re-read `GetSchedule` and send only what is missing.
- `ReserveSessions` and `AssociateFavorites`: a `200` does NOT mean all succeeded. Parse the per-session failure array and return it. A session already reserved reports as a FAILURE — document that re-sending is not a safe retry.
- `ListSessions` pagination: walk `nextToken` until ABSENT. Never stop on a short page. Support `includeAbstracts=false` and `locale`.
- Quotas, per attendee per minute: GetSession 120, ListSessions 120, GetSchedule 60, every write 30 counting SESSIONS not requests. Token bucket per operation.
- Export `reserveThenVerify(sessionIds)`: reserve, then `GetSchedule`, return what is actually held. NEVER cancel before a verified reserve.

## 3. `src/api/remote-mcp-bridge.ts`

Streamable HTTP MCP client to `https://api.awsevents.com/mcp` using the bearer token. List remote tools, invoke a named remote tool by name with args, return the result. Comment that this server requires sign-in for EVERY call including catalog reads, unlike the REST API. No deps beyond `@modelcontextprotocol/sdk`.

## 4. `data/mock-reinvent2026.json`

A small FIXTURE for tests and offline runs only. 12–16 sessions.

- A top-level `_notice` field stating this is synthetic test data, NOT live AWS data, never presented as live.
- Venues: The Venetian, Wynn | Encore, Caesars Forum, MGM Grand, Mandalay Bay.
- Levels 200–500. Formats: Breakout, Chalk Talk, Builders' Session, Workshop, Launch Session.
- Mix of availability: some `full` and not reservable (to exercise walk-up favourite logic), some `open`, some `filling`.
- Include deliberate time conflicts and at least two back-to-back pairs across different venues.

## Rules

Strict TS. No `any` unless a comment justifies it. Comments only where a non-obvious constraint needs explaining. If a type is missing from `types.ts`, fit what exists and report the gap — do not edit `types.ts`.

## Verify

```
cd /home/alex/.kiro/crew/workspace/repo-invent
npx tsc -p tsconfig.json --noEmit
```

Zero errors attributable to your files.

## Report back

Files created, the exact redirect URI chosen, any type gaps found, and the tsc result.
