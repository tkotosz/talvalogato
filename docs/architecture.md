# Architecture

Tálválogató has three parts in one package: a platform-neutral core, a Cloudflare Worker, and a React single-page app. esbuild bundles the app and the Worker; Cloudflare Pages serves the static files and runs the Worker for `/api` routes.

```
browser                                   Cloudflare
┌───────────────────────────────┐         ┌──────────────────────────┐
│ src/web                       │  /api   │ src/worker               │  HTML   ┌────────────┐
│ screens ─ App ─ data hooks ───┼────────▶│ routes ─ scraper ────────┼────────▶│ teletal.hu │
│            │                  │  JSON   │   │ edge cache            │         └────────────┘
│            ▼                  │         └───┼──────────────────────┘
│ src/core: reducer, rules ◀────┼─────────────┘ (shared types and rules)
│ localStorage: plan, settings  │
└───────────────────────────────┘
```

## Core

`src/core` holds plain types and functions with no browser or Worker dependencies. `weeks.ts` handles ISO weeks and Budapest dates. `planning.ts` holds the rules for decks, limits, decisions, and cart lines. `planner.ts` holds the planning flow as `reducePlanner(state, action, context)` with `plannerView(state, context)` deriving everything the screens show. The context carries what the core cannot know itself: the published weeks, the active week's catalog, and the current time.

## Worker

`src/worker/index.ts` serves three JSON routes: published weeks, a week's catalog, and course details for up to ten lines. `teletal.ts` reads Teletál's HTML with cheerio, including sections Teletál loads separately. Responses are cached at the edge, and failed lookups are marked retryable and left out of the cache.

## Web app

`App.tsx` owns the planner state and passes `dispatch` and the derived view to one screen per step. `useLoad` loads remote data keyed by what it depends on; the swipe deck loads course details in batches with progress. The plan and settings are saved to `localStorage` after every change. Handing picks to Teletál happens through a bookmark that runs on teletal.hu and updates its cart.

## Key decisions

- **Folders instead of workspaces.** One app and one build; the folder boundary keeps the core platform-neutral without package wiring.
- **The planning flow is a reducer in the core.** The flow's rules are unit tested without a browser, and screens stay thin.
- **The Worker scrapes Teletál's HTML.** Teletál has no public API; the scraper is the only place that knows its markup.
- **Cart handoff through a bookmark.** Only a script running on teletal.hu can use the signed-in Teletál session.
- **Data stays in the browser.** There are no accounts or server storage; plans and settings live in `localStorage`.
- **TypeScript checked by `tsc`, run directly by Node in tests.** esbuild strips types for the bundle, and `node --test` runs `.ts` files without a build step.
