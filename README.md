# Tálválogató

Tálválogató is an installable planner for Teletál. Choose a delivery week, then plan each day with a Teletál lunch or full-day menu, or build your own menu course by course, swiping through the dishes. Review the week and send it to the Teletál cart. The settings dialog saves a calorie limit and menu-code exclusions across weeks. Each Teletál menu, and each dish of your own menu, uses one order line.

## Run locally

Install dependencies with `npm ci`, then run `npm run dev` and open the printed URL. The page reloads when a file in `src/` or `public/` changes.

| Command | What it does |
| --- | --- |
| `npm run format` | Formats the code with Prettier |
| `npm run lint` | Checks formatting, then runs ESLint |
| `npm run typecheck` | TypeScript, for the app and the tests |
| `npm test` | Unit tests for the planning rules and the Teletál scraper |
| `npm run test:e2e` | Plans a week in Chrome against the live Teletál menu; screenshots go to `test/e2e/screenshots/` |
| `npm run build` | Packages the app as a single Worker with its static assets |

`AGENTS.md` describes the layout and the rules that are easy to break, and `docs/architecture.md` the structure.

## Send picks to Teletál

The cart dialog walks through saving a reusable browser bookmark. Run it on the Teletál week opened by the meal picker. After confirmation it adds the selected quantities to the current Teletál cart and opens the cart for review. Sign in on Teletál when prompted. The weekly review also has a copyable list of meal codes. Weekend days use the Saturday and Sunday lines Teletál publishes, and Friday's lines for the rest. Teletál delivers them on Friday.

## Deploy on Cloudflare Pages

Pull requests to `main` check formatting and lint, run the type check and the unit tests, build the Pages bundle, and run CodeQL and dependency review. A successful CI run for a push to `main` deploys that commit to the Pages `preview` branch. The **Deploy** workflow can also be run manually on `main` to refresh the preview.

Publishing a GitHub Release runs CI on the tag's commit and deploys it to the Pages production branch, `main`.

```sh
gh release create v0.1.0 --target main --generate-notes
```

The Cloudflare project is a [Direct Upload Pages project](https://developers.cloudflare.com/pages/get-started/direct-upload/) named `talvalogato`, with `main` as its production branch. GitHub Actions uses two [repository secrets](https://github.com/tkotosz/talvalogato/settings/secrets/actions).

- `CLOUDFLARE_ACCOUNT_ID` holds the ID of the account that owns the Pages project.
- `CLOUDFLARE_API_TOKEN` holds a token with **Account → Cloudflare Pages → Edit** on that account. [Cloudflare token setup](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/#generate-an-api-token)

To run the Pages bundle locally, build it and start Wrangler.

```sh
npm run build:pages
npx --yes wrangler@4.156.2 pages dev pages-dist
```

Pages serves the app and its offline assets from `pages-dist/`. Its `_worker.js` runs the Teletál API routes.
