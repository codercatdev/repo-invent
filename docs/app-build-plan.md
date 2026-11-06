# Build plan: replicate the official re:Invent app

Working notes for the app rebuild. This file is the durable state, because the
session ledger tool is unavailable on this host.

## Goal

Match the official app's shape, then beat it: four tabs, mobile first, with the
repository check directly under the Ask box on Home.

## Tabs

| Tab | Contents | Data source |
| --- | --- | --- |
| Home | Ask box, repo check, gaps, the week, tickets, "Next up" | `/api/scan`, `/api/catalog` |
| Catalog | 2,279 sessions, search, filters, session sheet | `/api/catalog` |
| Calendar | Bookings by day, or the last scanned week as a suggestion | `/api/schedule` |
| Parties | 171 parties by night, search, RSVP and map links | `/api/parties` |

## Shipped

| Feature | Evidence |
| --- | --- |
| Party dataset: 171 events, 6 days, 141 unique RSVP links | `data/parties.json` |
| Re-runnable party parser | `scripts/parse-parties.mjs` |
| Venue, address and map link on every party | `scripts/enrich-parties.mjs` |
| Four-tab shell at `/`, old page at `/scan` | `web/app.html` |
| Repo check on Home, with gaps | `cb1c96a` |
| Full plan in Home: gaps, week, tickets | `138ea04` |
| Walking time between sessions, tight legs flagged | `7e7fe80` |
| Ask AWS box searches the catalog | `6b9d802` |
| Session sheet: speakers, code, abstract, Save | `2cba21e` |
| Save verified from `GetSchedule` | `41b6739` |
| Remove a saved session, verified | `8a253c5` |
| Catalog filters: type, level, venue, track | `f4e6d5d` |
| Parties search by name, sponsor, place | `c793f15` |
| Calendar shows the scanned week before sign-in | `3ee0122` |
| Live catalog cached on disk, 6 hour TTL | `ce92e55` |
| Crash guards for sparse records | `2ccbe77` |

## Numbers checked against the live API

- 2,279 session-like entries in the catalog.
- Levels: 100 = 98, 200 = 381, 300 = 1,332, 400 = 420, 500 = 48.
- Tracks: Discussion 819, Lecture-style 812, Hands-on 631, AWS Partners 288.
- 2,091 sessions carry named speakers.
- No recording flag exists in the live payload, so the app does not show one.

## Open

1. A live public deploy needs the user: `./deploy/deploy.sh us-east-1 <profile>`.
2. The deployed Function URL still serves an older build.
3. Party data is a point-in-time scrape; re-run the two scripts to refresh. Re-scraped 2026-11-06: still 171 parties, no new rows, so the dataset is current.

## Rules the UI must keep

- Seats are coarse: say "walk-up only", never "3 seats left".
- Never claim a booking that was not verified from `GetSchedule`.
- A suggestion is labelled a suggestion, never a booking.
- Scanned data says whether it is live, cached, or the bundled sample.
- Brief content in `dist/`, `web/`, `data/`, and `demo-sample/` ships in the Lambda zip.
