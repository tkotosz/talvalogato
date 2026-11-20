# Meal Deck

Meal Deck is an installable planner for Teletál. It uses the published weekly menu and sums per-portion nutrition for each card. Settings control which option types appear, with Teletál set menus first, followed by custom combinations and single dishes. Each custom course is an order line, and each Teletál set menu uses one order line.

## Run locally

Install dependencies with `npm ci`, then run `npm run dev` and open the printed URL. `npm test` checks the planner and week logic. `npm run build` packages the app as a single Worker with its static assets.

`src/SwipeCard.jsx` is a reusable React component. Pass the allowed directions and labels in `actions`, handle the result with `onAction`, and optionally use the component ref to trigger a swipe from a button or keyboard shortcut. The caller owns the content and the deck order.

## Send picks to Teletál

The cart dialog walks through saving a reusable browser bookmark. Run it on the Teletál week opened by Meal Deck. After confirmation it adds the selected quantities to the current Teletál cart and opens the cart for review. Sign in on Teletál when prompted. The weekly review also has a copyable list of meal codes. If you saved the original bookmark, update it once to send plans with more than 14 distinct cart lines.
