# AWS Events API — Verified Facts

Checked live on 2026-11-04 against `api.awsevents.com` and the AWS Events docs.

## Verified

| Fact | Value |
|---|---|
| REST base | `https://api.awsevents.com` |
| OpenAPI | `https://api.awsevents.com/v1/openapi.json` (3.1.0, 12 operationIds) |
| MCP endpoint | `https://api.awsevents.com/mcp` (streamable HTTP) |
| Event | `re:Invent 2026`, id `reinvent2026` |
| Dates | 2026-11-30T05:30 to 2026-12-04T23:59 America/Los_Angeles |
| Client ID | `7vmom55m1qstvq8i71ph127bfq` (public, shared by all callers) |
| Scope | `openid email events/access` |
| Identity provider | `AWSBuilderID` |
| Authorize | `https://oauth.awsevents.com/oauth2/authorize` |
| Token | `https://oauth.awsevents.com/oauth2/token` |
| Revoke | `https://oauth.awsevents.com/oauth2/revoke` |
| Access token life | 60 minutes (JWT) |
| Refresh token life | 30 days (opaque) |

**CORRECTION to the original brief:** the redirect port `8976` is wrong.
For a self-built app, only loopback ports `8484`–`8489` are registered.
Use `http://localhost:8484/callback`. A path is required. Match is exact.
MCP clients use their own registered callbacks (`8976` for Kiro, `8484` for Claude Code).

## Access matrix

| Call | Token | Registered for event |
|---|---|---|
| `ListEvents` | no | no |
| `GetEvent` | no | no |
| `ListSessions` / `GetSession` | yes | yes |
| Everything on your schedule | yes | yes |

Verified by live probe: `GET /v1/events/reinvent2026/sessions` with no token returns **401** `{"message":"Sign in to continue"}`. The doc says 403 for a token without registration. Both are real, different causes.

## Error semantics that change the design

| Status | Meaning | Action |
|---|---|---|
| 401 | No or expired token | Refresh once, retry |
| 403 + JSON | Signed in, not registered | Do not retry. Register first. |
| 403 + empty | Edge refusal | Back off, retry |
| 404 | Gone | For deletes, treat as done |
| 409 | Operation closed | Retry later. Reservations may be closed. |
| 429 | Quota | Wait `Retry-After`, then retry |
| 500/503 | Server fault | Reads: backoff. Writes: reconcile via `GetSchedule` |

**No idempotency key.** After an unknown write outcome, re-read `GetSchedule` and send only what is missing.

## Quotas (per attendee, per minute)

| Operation | Limit |
|---|---|
| GetSession | 120 |
| ListSessions | 120 |
| GetSchedule | 60 |
| ReserveSessions | 30 sessions |
| AssociateFavorites | 30 sessions |
| CancelReservation | 30 |
| DisassociateFavorite | 30 |
| Personal time (all three) | 30 each |

Batches are counted per session, not per request, so a batch saves round trips only.

## Session shape

`ListSessions` and `GetSession` return the same object. Every field is optional.

Carries: `sessionId`, title, abstract, short code, type, level, taxonomy lists (tracks, topics, industries, roles, services), start/end, room, venue, all-day flag, reservability, a **coarse** fullness signal or walk-up flag, speaker names.

Notes that matter:
- Per-session result arrays, not a single status, on `ReserveSessions` and `AssociateFavorites`.
- A session already reserved reports as a **failure**. Re-sending is not a safe retry.
- No server-side search or filter. Filter client-side.
- `includeAbstracts=false` for bulk indexing; abstract is the largest field.
- `locale` query param; `Content-Language` header reports what was served.
- Stop paging only when `nextToken` is absent. A short page is not the end.

## Personal time

```json
{
  "title": "required, 1-128",
  "description": "required, 1-250",
  "startDateTime": "2026-12-01T19:00:00",
  "endDateTime": "2026-12-01T21:00:00",
  "location": "optional, <=255"
}
```

- Local event time. No offset, no `Z`. Seconds must be `00`.
- Whole 5-minute increments only.
- Create returns **204 with no body**. Read `GetSchedule` for the new ID.
- `PUT` is a full replacement. Omit an optional field and it is cleared.

## Consequences for repo:Invent

1. **No mock catalog as a headline.** `ListEvents` is public. The 401/403 wall sits on the catalog, not on sign-in. A judge with Builder ID and registration sees real data.
2. **Fullness is coarse.** The "seats === 0" trigger in the original brief does not exist. Detect fullness from the coarse signal and from `ReserveSessions` failure codes.
3. **Full catalog read needs registration.** Walk pages at <=120/min with `includeAbstracts=false`.
4. **Atomic swap is mandatory.** Reserve first, verify from `GetSchedule`, then cancel. Never cancel first.
5. **Redirect must be `localhost:8484/callback`.** `8976` fails with `redirect_mismatch`.
6. **Refresh on `expires_in`, not a constant.** Persist the rotated refresh token.
