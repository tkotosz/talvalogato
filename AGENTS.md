# Tálválogató

A Teletál weekly meal planner: a React app and a Cloudflare Worker that reads the menu from teletal.hu. The user interface is Hungarian; code, comments and docs are American English.

## Commands

- `npm run dev`: local server with live reload on http://127.0.0.1:4173 (`TALVALOGATO_PORT` changes the port). It reads the published menu data unless `TALVALOGATO_MENU_DIR` points at a folder written by `npm run refresh-menu`.
- `npm run refresh-menu -- --out <folder>`: reads Teletál and writes the menu data files; the Menu data workflow runs it twice a day
- `npm run format`: Prettier; `npm run lint` fails on unformatted files
- `npm run lint`, `npm run typecheck`, `npm test`: run all three before committing; CI runs them on every pull request
- `npm run test:e2e`: browser walkthrough against the live Teletál menu, run after UI or flow changes; it needs Chrome (or `TALVALOGATO_CHROME`) and network access
- `npm run build:pages`: the bundle CI deploys

## Layout

- `src/core/`: platform-neutral types and rules (`types.ts`, `weeks.ts`, `planning.ts`, `courses.ts`, `custom.ts`) and the planning flow as a reducer (`planner.ts`). Imports nothing from `web` or `worker`.
- `src/scraper/`: the Teletál reader (`teletal.ts`) and how a week's data is built (`refresh.ts`), used by `scripts/refresh-menu.ts`.
- `src/worker/`: the Worker entry (`index.ts`) and the `/api` routes (`api.ts`), which serve the menu data files.
- `src/web/`: the React app. `App.tsx` wires the reducer, data loading and dialogs; `screens/` has one file per step; `components/` the shared parts; `cart-shortcut.ts` the cart bookmark.
- `test/`: unit tests (`*.test.ts`) and the end-to-end walkthrough (`e2e/`).
- `scripts/`: the esbuild build and the dev server. `public/`: static files and the service worker.

## Rules that are easy to break

- **Flow changes go through the reducer.** Add an action to `reducePlanner` and a unit test in `test/planner.test.ts`; screens only dispatch actions and render `plannerView`.
- **The cart bookmark runs on teletal.hu.** `importOnTeletal` is serialized with `toString()`, so it must not use imports or anything outside its own body. The link carries `{ v, id, year, week, lines }` as base64url after `#talvalogato=`. A change the saved bookmark cannot handle raises `cartLinkVersion` and the bookmark's `supportedVersion` together, so an old bookmark asks to be saved again; say so in the pull request. Keep the bookmark's own constants in step with the exported ones, and cover changes in `test/cart-shortcut.test.ts`.
- **Weekend days.** Teletál delivers on weekdays only; weekend meals arrive with Friday's delivery and follow Friday's ordering deadline. A weekend day offers the lines Teletál publishes for that day (`nap` 6 or 7) and Friday's lines for codes without a weekend line (`dayCandidates`). Cart lines keep the real day.
- **Availability comes from Teletál.** A day is orderable when its date allows it (Budapest time, not today or tomorrow) and Teletál showed enabled order inputs for it at the last refresh. Do not add time-of-day deadlines without checking Teletál's ordering terms.
- **Menu data is built on a schedule.** The Worker only serves the files on the `data` branch and must not read Teletál: a Worker request may use 10 ms of CPU on Cloudflare's free plan. Only the Menu data workflow writes the `data` branch. After changing the scraper, run `npm run refresh-menu` into a scratch folder and compare the output with the real Teletál pages; fixtures in `test/teletal.test.ts` cover known page shapes. Keep request volume low.
- **Menu data shape.** The files on the `data` branch follow `MenuWeeks` and `MenuWeek` in `src/core/types.ts`. A change the app cannot read must ship together with the workflow change and a manual run of Menu data, because the deployed app reads whatever the branch holds. Courses for custom days come from Teletál sections in `courseOf` (`src/scraper/teletal.ts`); the rules for building a custom day live in `src/core/custom.ts`.
- **Saved data.** Each week has its own plan, saved together in `localStorage` under `talvalogato.plans.v3`; preferences live under `talvalogato.preferences.v1`. `restorePlans` drops weeks that have ended and carries over the single plan saved under `talvalogato.plan.v2` before. Changing the saved shape needs a new key or a migration in `restorePlans`, `restorePlan` and `restorePreferences`.
- **TypeScript 6.** typescript-eslint does not support TypeScript 7 yet; keep `typescript` on 6.x until it does.
