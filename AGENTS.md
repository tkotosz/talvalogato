# Tálválogató

A Teletál weekly meal planner: a React app and a Cloudflare Worker that reads the menu from teletal.hu. The user interface is Hungarian; code, comments and docs are American English.

## Commands

- `npm run dev`: local server with live reload on http://127.0.0.1:4173 (`TALVALOGATO_PORT` changes the port)
- `npm run format`: Prettier; `npm run lint` fails on unformatted files
- `npm run lint`, `npm run typecheck`, `npm test`: run all three before committing; CI runs them on every pull request
- `npm run test:e2e`: browser walkthrough against the live Teletál menu, run after UI or flow changes; it needs Chrome (or `TALVALOGATO_CHROME`) and network access
- `npm run build:pages`: the bundle CI deploys

## Layout

- `src/core/`: platform-neutral types and rules (`types.ts`, `weeks.ts`, `planning.ts`, `courses.ts`, `custom.ts`) and the planning flow as a reducer (`planner.ts`). Imports nothing from `web` or `worker`.
- `src/worker/`: the Worker entry (`index.ts`) with the `/api` routes and the Teletál scraper (`teletal.ts`).
- `src/web/`: the React app. `App.tsx` wires the reducer, data loading and dialogs; `screens/` has one file per step; `components/` the shared parts; `cart-shortcut.ts` the cart bookmark.
- `test/`: unit tests (`*.test.ts`) and the end-to-end walkthrough (`e2e/`).
- `scripts/`: the esbuild build and the dev server. `public/`: static files and the service worker.

## Rules that are easy to break

- **Flow changes go through the reducer.** Add an action to `reducePlanner` and a unit test in `test/planner.test.ts`; screens only dispatch actions and render `plannerView`.
- **The cart bookmark runs on teletal.hu.** `importOnTeletal` is serialized with `toString()`, so it must not use imports or anything outside its own body. The link carries `{ v, id, year, week, lines }` as base64url after `#talvalogato=`. A change the saved bookmark cannot handle raises `cartLinkVersion` and the bookmark's `supportedVersion` together, so an old bookmark asks to be saved again; say so in the pull request. Keep the bookmark's own constants in step with the exported ones, and cover changes in `test/cart-shortcut.test.ts`.
- **Weekend days.** Teletál delivers on weekdays only; weekend meals arrive with Friday's delivery and follow Friday's ordering deadline. A weekend day offers the lines Teletál publishes for that day (`nap` 6 or 7) and Friday's lines for codes without a weekend line (`dayCandidates`). Cart lines keep the real day.
- **Availability comes from Teletál.** A day is orderable when its date allows it (Budapest time, not today or tomorrow) and Teletál still shows enabled order inputs for it. Do not add time-of-day deadlines without checking Teletál's ordering terms.
- **Scraper changes are checked against the live site.** Fixtures in `test/teletal.test.ts` cover known page shapes; after changing `teletal.ts`, compare `/api/menu` and `/api/nutrition` output with the real Teletál page, and keep request volume low.
- **Catalog shape.** When `CatalogDish` changes, raise `catalogFormat` in `src/web/menu-client.ts`, so the browser and the edge cache never return a catalog in the old shape. Courses for custom days come from Teletál sections in `courseOf` (`src/worker/teletal.ts`); the rules for building a custom day live in `src/core/custom.ts`.
- **Saved data.** Each week has its own plan, saved together in `localStorage` under `talvalogato.plans.v3`; preferences live under `talvalogato.preferences.v1`. `restorePlans` drops weeks that have ended and carries over the single plan saved under `talvalogato.plan.v2` before. Changing the saved shape needs a new key or a migration in `restorePlans`, `restorePlan` and `restorePreferences`.
- **TypeScript 6.** typescript-eslint does not support TypeScript 7 yet; keep `typescript` on 6.x until it does.
