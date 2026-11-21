# Architecture

Tálválogató has four parts in one package:
- a platform-neutral core
- a scraper that builds the menu data on a schedule
- a Cloudflare Worker that serves that data
- a React single-page app

esbuild bundles the app and the Worker. Cloudflare Pages serves the static files and runs the Worker for `/api` routes.

```
GitHub Actions (twice a day)                         data branch
src/scraper ── reads teletal.hu ── commits JSON ───▶ menu/weeks.json, menu/<week>.json
                                                          │
browser                                   Cloudflare      │ fetch
┌───────────────────────────────┐         ┌───────────────▼──────────┐
│ src/web                       │  /api   │ src/worker               │
│ screens ─ App ─ data hooks ───┼────────▶│ routes, edge cache       │
│            │                  │  JSON   └──────────────────────────┘
│            ▼                  │
│ src/core: reducer, rules      │  (shared with the scraper)
│ localStorage: plans, settings │
└───────────────────────────────┘
```

## Core

`src/core` holds plain types and functions with no browser, Node or Worker dependencies.
- `weeks.ts` handles ISO weeks and Budapest dates.
- `planning.ts` holds the rules for decks, limits, decisions, and cart lines.
- `custom.ts` holds the rules for menus built course by course.
- `planner.ts` holds the planning flow as `reducePlanner(state, action, context)`, with `plannerView(state, context)` deriving everything the screens show. The context carries what the core cannot know itself: the published weeks, the active week's dishes, and the current time.

## Menu data

`src/scraper/teletal.ts` reads Teletál's HTML with cheerio, including the sections Teletál loads separately and each dish's detail page.

`scripts/refresh-menu.ts` turns that into JSON: a list of the published weeks with the time of the refresh, and one file per week with every dish already combined with its details. It reuses the previous files' details for lines that did not change, and it reads everything before writing, so a failed run keeps the previous data.

The **Menu data** workflow runs the script twice a day and on demand, and commits the result to the `data` branch.

## Worker

`src/worker/api.ts` serves `/api/weeks` and `/api/menu?week=…` by fetching the matching file from the data branch and caching it at the edge. It never parses HTML, so a request uses almost no CPU time.

## Web app

`App.tsx` owns the planner state and passes `dispatch` and the derived view to one screen per step. `useLoad` loads remote data keyed by what it depends on. A week's dishes arrive with their details, so decks open without further requests. Plans, one per week, and settings are saved to `localStorage` after every change. Picks go to Teletál through a bookmark that runs on teletal.hu and updates its cart.

## Key decisions

- **Folders instead of workspaces.** One app and one build; the folder boundary keeps the core platform-neutral without package wiring.
- **The planning flow is a reducer in the core.** The flow's rules are unit tested without a browser, and screens stay thin.
- **Menu data is built on a schedule, not on request.** Parsing a week of Teletál's HTML takes far more CPU than a Worker request may use, and menus change rarely. A scheduled job reads Teletál twice a day and keeps its load low.
- **The data lives in a branch of the repository.** It needs no extra storage service or credentials, keeps a history of the menus, and its commits keep the scheduled workflow active.
- **The scraper is the only place that knows Teletál's markup.** Teletál has no public API.
- **Cart handoff through a bookmark.** Only a script running on teletal.hu can use the signed-in Teletál session.
- **Data stays in the browser.** There are no accounts or server storage; plans and settings live in `localStorage`.
- **TypeScript checked by `tsc`, run directly by Node.** esbuild strips types for the bundle, and Node runs the `.ts` scripts and tests without a build step.
