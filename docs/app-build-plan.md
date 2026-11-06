# Build plan: replicate the official re:Invent app

Working notes for the app rebuild. Update this file as steps land, because the
session ledger is unavailable.

## Goal

Match the official app's shape, then beat it: four tabs, mobile first, with the
repository scan as our differentiator on the home screen.

## Tabs

| Tab | Contents | Data source |
| --- | --- | --- |
| Home | Greeting, "Plan my week", seat alerts, repo scan button, Ask box | local + `/api/scan` |
| Catalog | 2,476 sessions, search, filters, session sheet | `/api/catalog` |
| Calendar | My reservations and favourites by day | `/api/schedule` |
| Parties | 171 vendor parties by day | `data/parties.json` |

## Done

- [x] Party dataset: 171 events, 6 days, 166 RSVP links (`data/parties.json`)
- [x] Re-runnable parser: `scripts/parse-parties.mjs`
- [x] Backend: `/api/scan`, `/api/session`, `/api/schedule`

## Next

- [x] `/api/catalog` route (`f809b7d`): 200, fixture source, 16 sessions
- [x] `/api/parties` route (`f809b7d`): 200, 171 parties, 6 days
3. New mobile shell: `web/app.html`, four tabs, bottom bar.
4. Move the current scan page to `web/scan.html`, linked from Home.
5. Session detail sheet with Reserve and Favourite.

## Rules the UI must keep

- Seats are coarse: say "walk-up only", never "3 seats left".
- Never claim a booking that was not verified from `GetSchedule`.
- Scanned data says whether it is live, cached, or the bundled sample.
- Brief content in `dist/`, `web/`, `data/`, and `demo-sample/` ships in the Lambda zip.
