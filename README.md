# Tálválogató

Tálválogató is an installable planner for Teletál. Choose a delivery week, then put each day together on a tray: Teletál menus, soups, mains, and extras such as bread, dessert or a drink, as many of each as you like. Menus, soups and mains are picked by swiping through them, extras from a list, or an idea fills the empty rows. Review the week and send it to the Teletál cart. Prices are copied from Teletál too, so the Teletál cart shows the final ones. The settings dialog saves a daily calorie limit, a weekly spending limit, menu-code exclusions, a vegetarian or vegan diet, allergens to leave out and disliked ingredients across weeks. The two limits hide what does not fit what is left, and show the rest when asked; going over the spending limit is pointed out but still goes to the cart. Each Teletál menu, and each dish of your own menu, uses one order line.

Tálválogató is an unofficial app and is not affiliated with Teletál Ételfutár Kft. The published site is a demo: its menus are invented, and it sends nothing to the Teletál cart.

## Allergens

Tálválogató copies the allergens, ingredients and diet marks from Teletál's pages automatically, so they can be outdated or wrong. Traces of an allergen are possible even when it is not listed: Teletál itself says that some of its dishes share a kitchen with the others, so cross-contamination cannot be excluded. The allergen filter hides the dishes for which Teletál lists an excluded allergen, and the dishes without allergen data; it does not make a dish safe. Check every dish on Teletál before ordering. In the demo, the dishes and their allergens are invented.

## Run locally

Install dependencies with `npm ci`, then run `npm run dev` and open the printed URL. The page reloads when a file in `src/` or `public/` changes.

| Command | What it does |
| --- | --- |
| `npm run format` | Formats the code with Prettier |
| `npm run lint` | Checks formatting, then runs ESLint |
| `npm run typecheck` | TypeScript, for the app and the tests |
| `npm test` | Unit tests for the planning rules, the Teletál scraper and the demo menu |
| `npm run test:e2e` | Plans a week in Chrome on the demo menu; screenshots go to `test/e2e/screenshots/` |
| `npm run build` | Packages the app as a single Worker with its static assets |

`AGENTS.md` describes the layout and the rules that are easy to break, and `docs/architecture.md` the structure.

## Send picks to Teletál

The cart dialog walks through saving a reusable browser bookmark. Run it on the Teletál week opened by the meal picker. After confirmation it adds the selected quantities to the current Teletál cart and opens the cart for review. Sign in on Teletál when prompted. The weekly review also has a copyable list of meal codes. Weekend days use the Saturday and Sunday lines Teletál publishes, and Friday's lines for the rest. Teletál delivers them on Friday.

## Menu data

The app does not read Teletál directly. The **Menu data** workflow commits the menus as JSON to the `data` branch once a day, and the Worker serves those files. Run the workflow from the Actions tab to refresh the menu right away.

The workflow writes an invented demo menu (`npm run demo-menu`) and does not contact Teletál. Its `weeks.json` is marked `"demo": true`, so the app shows a demo banner and leaves out the cart. `npm run refresh-menu` reads Teletál's real menus instead; its data has no demo mark.

To work with local data, write it with `npm run demo-menu -- --out <folder>` or `npm run refresh-menu -- --out <folder>`, and start the dev server with `TALVALOGATO_MENU_DIR=<folder>`.

## Deploy on Cloudflare Pages

Pull requests to `main` check formatting and lint, run the type check and the unit tests, build the Pages bundle, and run CodeQL and dependency review. A successful CI run for a push to `main` deploys that commit to the Pages `preview` branch. The **Deploy** workflow can also be run manually on `main` to refresh the preview.

To try a pull request, the repository owner comments `/preview` on it once CI has passed on its latest commit. The **PR preview** workflow builds that commit and publishes it to `https://pr-<number>.talvalogato.pages.dev`, then links it in a comment on the pull request. Commenting `/preview` again publishes a newer commit, `/preview delete` removes the preview, and closing the pull request removes it too. Only pull requests to `main` from branches in this repository get a preview.

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
