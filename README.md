# Tálválogató

Tálválogató is an installable planner for Teletál. It uses the published weekly menu and sums per-portion nutrition for each card. Settings control which option types appear, with Teletál set menus first, followed by custom combinations and single dishes. Each custom course is an order line, and each Teletál set menu uses one order line.

## Run locally

Install dependencies with `npm ci`, then run `npm run dev` and open the printed URL. `npm test` checks the planner and week logic. `npm run build` packages the app as a single Worker with its static assets.

`src/SwipeCard.jsx` is a reusable React component. Pass the allowed directions and labels in `actions`, handle the result with `onAction`, and optionally use the component ref to trigger a swipe from a button or keyboard shortcut. The caller owns the content and the deck order.

## Send picks to Teletál

The cart dialog walks through saving a reusable browser bookmark. Run it on the Teletál week opened by the meal picker. After confirmation it adds the selected quantities to the current Teletál cart and opens the cart for review. Sign in on Teletál when prompted. The weekly review also has a copyable list of meal codes. If you saved the original bookmark, update it once to send plans with more than 14 distinct cart lines.

## Deploy on Cloudflare Pages

Pull requests to `main` run the unit tests, build the Pages bundle, and run CodeQL and dependency review. A successful CI run for a push to `main` deploys that commit to the Pages `preview` branch. The **Deploy** workflow can also be run manually on `main` to refresh the preview.

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
