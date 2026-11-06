# Rebuild plan: Next.js App Router + shadcn/ui

A real front end over the existing engine. The `src/` folder stays the source of
truth for scanning, catalog, planning and the AWS Events client; it is already
typed, tested and working. This replaces the hand-written `web/app.html` with a
proper React app.

## Why keep `src/`

`src/` is 52 passing tests of real logic: repo scanning, CDK/Terraform parsing,
gap diagnosis, the transit guard, the scorer, the MCP bridge, the token store.
Rewriting that in React would be re-typing proven code for no user-visible gain.
The Next app imports it directly, so there is one implementation.

## Shape

```
web-next/
  app/
    layout.tsx           root shell, fonts, theme provider
    page.tsx             Home
    catalog/page.tsx     Catalog
    calendar/page.tsx    Calendar
    parties/page.tsx     Parties
    scan/page.tsx        full scan report
    api/
      scan/route.ts
      catalog/route.ts
      parties/route.ts
      schedule/route.ts
      favorite/route.ts
      unfavorite/route.ts
      personal-time/route.ts
  components/
    ui/                  shadcn primitives (button, input, card, sheet, tabs...)
    app-shell.tsx        header + bottom tab bar
    session-card.tsx
    session-sheet.tsx
    party-card.tsx
    scan-form.tsx
  lib/
    engine.ts            thin re-export of ../../src entry points
    types.ts
  lib/utils.ts           cn()
  app/globals.css        Tailwind v4 + theme tokens
```

## Rules carried over

- A booking is shown only after `GetSchedule` reads it back.
- A suggestion is labelled a suggestion.
- Coarse seats: "walk-up only", never a seat count.
- Every data view says whether it is live, cached or the fixture.
- The repo check sits directly under the Ask box on Home.

## Steps

1. Scaffold `web-next` with `create-next-app` (TypeScript, App Router, Tailwind, src dir off).
2. Add shadcn/ui, and the components the screens need.
3. `lib/engine.ts`: import `scanForWeb`, `servedCatalog`, `mySchedule`, `favoriteSession`, `unfavoriteSession`, `addPersonalTime`, `removePersonalTime`.
4. Route handlers wrapping those, same contracts as the old `/api/*`.
5. Build the four screens and the tab bar.
6. Screenshot-verify each screen, then typecheck, lint and build.
7. Point `npm run web` at Next, keep the old server on `npm run web:legacy`.

## Constraints found

- Node 22, npm 10.
- The engine is ESM with `.js` import specifiers; Next can consume it via a
  `tsconfig` path alias after a `tsc` build, so the app imports `dist/`.
- No AWS credentials on this host: deploy stays with the user.
