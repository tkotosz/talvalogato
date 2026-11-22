// Walks through the planner in Chrome at phone width, on the demo menu written to a scratch folder. The menu is served
// without its demo flag, so the cart works; the last test turns the flag back on.
// Run with `npm run test:e2e`. Set TALVALOGATO_CHROME to use a browser other than the installed Chrome.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright-core';
import { demoMenu } from '../../src/scraper/demo.ts';
import { writeMenuFiles } from '../../src/scraper/files.ts';

const port = 4198;
const base = `http://127.0.0.1:${port}/`;
const screenshots = new URL('./screenshots/', import.meta.url).pathname;
let server: ChildProcess;
let browser: Browser;
let menuDir: string;

before(async () => {
  menuDir = await mkdtemp(join(tmpdir(), 'talvalogato-menu-'));
  const { weeks, menus } = demoMenu(new Date());
  await writeMenuFiles(menuDir, { updatedAt: weeks.updatedAt, weeks: weeks.weeks }, menus);
  server = spawn(process.execPath, ['scripts/dev.mjs'], {
    env: { ...process.env, TALVALOGATO_PORT: String(port), TALVALOGATO_MENU_DIR: menuDir },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(base).catch(() => null);
    if (response?.ok) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await mkdir(screenshots, { recursive: true });
  const executablePath = process.env.TALVALOGATO_CHROME;
  browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
});

after(async () => {
  await browser?.close();
  server?.kill();
  if (menuDir) await rm(menuDir, { recursive: true, force: true });
});

async function openPlanner({ demo = false, userAgent = undefined as string | undefined } = {}): Promise<{
  page: Page;
  errors: string[];
}> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    ...(userAgent ? { userAgent, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  if (demo) {
    await page.route('**/api/weeks', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), demo: true } });
    });
  }
  await page.goto(base);
  await waitForWeek(page);
  return { page, errors };
}

const waitForWeek = (page: Page) =>
  page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.step-bar button.primary')?.disabled, null, {
    timeout: 30_000,
  });
const waitForDeck = (page: Page) => page.waitForFunction(() => !document.querySelector('.spinner'), null, { timeout: 60_000 });
const currentDay = (page: Page) => page.locator('.week-progress [aria-current="step"]').getAttribute('aria-label');

/** Decides on the current day and waits until the planner shows the decision. */
/** Picks from a deck, or moves on with Következő nap, and waits until the planner shows the result. */
async function decide(page: Page, deck: string, decision: 'Kiválasztom' | 'Következő nap') {
  const day = (await currentDay(page))?.split(',')[0] ?? '';
  if (decision === 'Következő nap') {
    await page.getByRole('button', { name: 'Következő nap' }).click();
    await page.waitForFunction(
      before => !document.querySelector('.week-progress [aria-current]')?.getAttribute('aria-label')?.startsWith(before),
      day,
    );
    return;
  }
  await page.getByRole('button', { name: deck }).click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  // The overview opens by itself after the last day's decision.
  const expected = `${day}, étel kiválasztva`;
  await page
    .locator(`.week-progress button[aria-label="${expected}"], .review`)
    .first()
    .waitFor({ timeout: 5_000 })
    .catch(() => assert.fail(`The day strip never showed "${expected}"`));
}

test('a whole week across both decks reaches the overview and the cart link', async () => {
  const { page, errors } = await openPlanner();
  await page.screenshot({ path: `${screenshots}week.png`, fullPage: true });
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  const days = await page.locator('.week-progress button:not(:disabled)').count();
  assert.ok(days > 0, 'the week has orderable days');
  await page.screenshot({ path: `${screenshots}menu-type.png`, fullPage: true });

  for (let index = 0; index < days; index++) {
    const day = await currentDay(page);
    const weekend = /Szombat|Vasárnap/.test(day ?? '');
    if (index === 1) await decide(page, '', 'Következő nap');
    else await decide(page, weekend ? 'Teletál egész napos menü választása' : 'Teletál ebédmenü választása', 'Kiválasztom');
    if (index === 0) await page.screenshot({ path: `${screenshots}deck.png`, fullPage: true });
  }

  // The day left without a choice keeps the overview from opening by itself.
  assert.match((await currentDay(page)) ?? '', /^\S+$/, 'the planner returns to the undecided day');
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  assert.equal(await page.locator('.review-row').count(), days);
  assert.equal(await page.locator('.review-row', { hasText: 'Nincs választás' }).count(), 1);
  await page.screenshot({ path: `${screenshots}overview.png`, fullPage: true });
  await page.getByRole('button', { name: 'Kosárhoz adás' }).click();
  const link = page.locator('dialog[open] a.button.primary');
  await link.waitFor({ timeout: 30_000 });
  const encoded = (await link.getAttribute('href'))!.split('#talvalogato=')[1]!;
  const lines: [number, string, number][] = JSON.parse(Buffer.from(encoded, 'base64url').toString()).lines;
  assert.ok(lines.length > 0);
  for (const [day, code] of lines) {
    if (['Z10', 'Z11', 'IRN'].includes(code)) assert.ok(day >= 6, `${code} on a weekend uses the weekend line`);
  }
  await page.screenshot({ path: `${screenshots}cart.png`, fullPage: true });
  // Desktop Chrome on Linux has no share sheet, so the link is copied instead.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await page.getByRole('button', { name: 'Link küldése' }).click();
  await page.locator('dialog[open] [role=status]', { hasText: 'Link kimásolva' }).waitFor();
  await page.screenshot({ path: `${screenshots}cart-share.png` });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await link.getAttribute('href'));
  assert.deepEqual(errors, []);
});

test('settings, editing from the overview, resuming, and a second week planned alongside', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  const firstDay = (await currentDay(page))?.split(',')[0] ?? '';
  await decide(page, 'Teletál egész napos menü választása', 'Kiválasztom');

  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Napi kalóriakeret').check();
  await page.locator('#target').fill('1000');
  await page.screenshot({ path: `${screenshots}settings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  assert.match(await page.locator('.review-row').first().innerText(), /Kalóriakereten felül/);

  await page.locator('.review-row').first().click();
  assert.ok((await currentDay(page))?.startsWith(firstDay));
  await page.getByRole('button', { name: 'Nap szerkesztése' }).click();
  assert.match(await page.locator('.editing-note').innerText(), /Jelenlegi választás/);

  await page.reload();
  await waitForWeek(page);
  assert.equal(await page.locator('.step-bar').getByRole('button', { name: 'Újrakezdés' }).count(), 1);
  await page.getByRole('button', { name: 'Folytatás' }).click();
  assert.match((await currentDay(page)) ?? '', /étel kiválasztva/);

  await page.getByRole('button', { name: 'Hét', exact: true }).click();
  const weeks = await page
    .locator('#week option')
    .evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  if (weeks.length > 1) {
    await page.locator('#week').selectOption(weeks[1]!);
    await waitForWeek(page);
    // Another week starts its own plan; the first week keeps its progress.
    await page.getByRole('button', { name: 'Válogatás indítása' }).click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('.menu-choices').waitFor();
    await page.locator('.step-progress').getByRole('button', { name: 'Hét' }).click();
    await page.locator('#week').selectOption(weeks[0]!);
    await waitForWeek(page);
    await page.getByRole('button', { name: 'Folytatás' }).click();
    assert.match((await currentDay(page)) ?? '', /étel kiválasztva/);
  }
  assert.deepEqual(errors, []);
});

/** Opens a component from the custom menu overview, picks its top dish, and waits for the overview again. */
async function pickFromOverview(page: Page, component: string) {
  await page.locator('.custom-summary button', { hasText: component }).click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
}

test('a week mixing set menus and custom days, with add-ons, a cleared component and an edit', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  await decide(page, 'Teletál ebédmenü választása', 'Kiválasztom');

  // The custom day: components first, then the overview where each component gets its dish.
  await page.getByRole('button', { name: 'Saját menü összeállítása' }).click();
  await page.locator('.course-choices-grid').getByRole('button', { name: 'Savanyúság' }).click();
  await page.locator('.course-choices-grid').getByRole('button', { name: 'Desszert' }).click();
  await page.screenshot({ path: `${screenshots}custom-select.png`, fullPage: true });
  await page.locator('.custom-step').getByRole('button', { name: 'Tovább' }).click();
  assert.equal(await page.locator('.custom-summary .custom-empty').count(), 4);
  assert.equal(await page.getByRole('button', { name: 'Mentés', exact: true }).isDisabled(), true);

  await pickFromOverview(page, 'Leves');
  await page.locator('.custom-summary button', { hasText: 'Főétel' }).click();
  await waitForDeck(page);
  await page.screenshot({ path: `${screenshots}custom-course.png`, fullPage: true });
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
  await pickFromOverview(page, 'Desszert');
  await page.locator('.custom-summary button', { hasText: 'Savanyúság' }).click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Nem kérek' }).click();
  await page.locator('.custom-summary').waitFor();
  assert.equal(await page.locator('.custom-summary .custom-empty').count(), 1);
  await page.screenshot({ path: `${screenshots}custom-overview.png`, fullPage: true });

  // Mentés saves and stays on the day.
  const day = (await currentDay(page))?.split(',')[0] ?? '';
  await page.getByRole('button', { name: 'Mentés', exact: true }).click();
  await page.getByRole('button', { name: 'Nap szerkesztése' }).waitFor();
  assert.ok((await currentDay(page))?.startsWith(`${day}, étel kiválasztva`));
  assert.equal(await page.locator('.step-bar .primary').innerText(), 'Következő nap');

  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  const custom = page.locator('.review-row', { hasText: 'Saját menü' });
  assert.equal(await custom.count(), 1);
  assert.equal(await custom.locator('.review-item').count(), 3);

  // Editing replaces one dish and saves.
  await custom.click();
  await page.getByRole('button', { name: 'Nap szerkesztése' }).click();
  const soupBefore = await page.locator('.custom-summary button', { hasText: 'Leves' }).innerText();
  await page.locator('.custom-summary button', { hasText: 'Leves' }).click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Passz' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
  assert.notEqual(await page.locator('.custom-summary button', { hasText: 'Leves' }).innerText(), soupBefore);
  await page.getByRole('button', { name: 'Változások mentése' }).click();
  await page.getByRole('button', { name: 'Nap szerkesztése' }).waitFor();
  await page.screenshot({ path: `${screenshots}custom-saved.png`, fullPage: true });

  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.getByRole('button', { name: 'Kosárhoz adás' }).click();
  const link = page.locator('dialog[open] a.button.primary');
  await link.waitFor({ timeout: 30_000 });
  const encoded = (await link.getAttribute('href'))!.split('#talvalogato=')[1]!;
  assert.equal(JSON.parse(Buffer.from(encoded, 'base64url').toString()).lines.length, 4, 'one set menu and three dishes');
  assert.deepEqual(errors, []);
});

test('a calorie limit hides what does not fit and lets the user go over for a component', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Napi kalóriakeret').check();
  await page.locator('#target').fill('700');
  await page.locator('#tolerance').fill('0');
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  await page.getByRole('button', { name: 'Saját menü összeállítása' }).click();
  await page.locator('.custom-step').getByRole('button', { name: 'Tovább' }).click();
  await pickFromOverview(page, 'Leves');

  await page.locator('.custom-summary button', { hasText: 'Főétel' }).click();
  await waitForDeck(page);
  const showOver = page.getByRole('button', { name: 'Mutasd a kereten felülieket is' });
  const nothingFits = (await showOver.count()) > 0;
  if (nothingFits) {
    await page.screenshot({ path: `${screenshots}custom-nothing-fits.png`, fullPage: true });
    await showOver.click();
    await waitForDeck(page);
  }
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
  await page.getByRole('button', { name: 'Mentés', exact: true }).click();
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  const row = page.locator('.review-row', { hasText: 'Saját menü' });
  await row.waitFor();
  if (nothingFits) assert.match(await row.innerText(), /Kereten felül, engedélyezve/);
  assert.equal(await page.getByRole('button', { name: 'Kosárhoz adás' }).isDisabled(), false);
  assert.deepEqual(errors, []);
});

test('a generated day offers whole menus within the calorie limit, and Vissza returns to the components', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Napi kalóriakeret').check();
  await page.locator('#target').fill('1500');
  await page.locator('#tolerance').fill('0');
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();

  await page.getByRole('button', { name: 'Menü generálása' }).click();
  await page.locator('.course-choices-grid').getByRole('button', { name: 'Desszert' }).click();
  await page.locator('.custom-step').getByRole('button', { name: 'Tovább' }).click();
  const card = page.locator('.swipe-card');
  await card.waitFor();
  assert.match(await card.innerText(), /Generált menü/);
  const dishCount = await card.locator('.course-list li').count();
  assert.equal(dishCount, 3, 'soup, main and dessert');
  await page.screenshot({ path: `${screenshots}generated.png`, fullPage: true });

  // Each rejected menu is replaced by another one that still fits the limit.
  const menus = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const text = (await card.locator('.course-list').textContent()) ?? '';
    menus.add(text);
    const kcal = Number((await card.locator('.calorie-badge').innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
    assert.ok(kcal <= 1500, `${kcal} kcal fits the 1500 kcal limit`);
    await page.getByRole('button', { name: 'Másikat kérek' }).click();
    await page.waitForFunction(before => document.querySelector('.swipe-card .course-list')?.textContent !== before, text);
  }
  assert.equal(menus.size, 4);

  // Vissza returns to the components; a new selection generates a new menu.
  await page.locator('.step-bar').getByRole('button', { name: 'Vissza' }).click();
  await page.locator('.course-choices-grid').getByRole('button', { name: 'Desszert' }).click();
  await page.locator('.custom-step').getByRole('button', { name: 'Tovább' }).click();
  await card.waitFor();
  assert.equal(await card.locator('.course-list li').count(), 2);

  const day = (await currentDay(page))?.split(',')[0] ?? '';
  const accepted = await card.locator('.course-list').innerText();
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator(`.week-progress button[aria-label="${day}, étel kiválasztva"]`).waitFor();
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  const row = page.locator('.review-row', { hasText: 'Saját menü' });
  await row.waitFor();
  assert.equal(await row.locator('.review-item').count(), 2);
  for (const line of accepted.split('\n').filter(part => /^[A-Z0-9]+$/.test(part.trim()))) {
    assert.match(await row.innerText(), new RegExp(line.trim()));
  }
  await page.screenshot({ path: `${screenshots}generated-overview.png`, fullPage: true });
  assert.deepEqual(errors, []);
});

test('the demo says so and leaves out the cart', async () => {
  const { page, errors } = await openPlanner({ demo: true });
  assert.match(await page.locator('.demo-banner').innerText(), /Bemutató változat/);
  assert.equal(await page.locator('.menu-updated').count(), 0);
  assert.doesNotMatch(await page.locator('.unofficial-notice').innerText(), /Teletál tulajdonai/);
  await page.screenshot({ path: `${screenshots}demo-week.png`, fullPage: true });

  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  await decide(page, 'Teletál ebédmenü választása', 'Kiválasztom');
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kosárhoz adás' }).count(), 0);
  await page.screenshot({ path: `${screenshots}demo-overview.png`, fullPage: true });
  assert.deepEqual(errors, []);
});

test("Telepítés: hidden without an offer, one tap with Chrome's offer, instructions on an iPhone", async () => {
  const { page, errors } = await openPlanner();
  const install = page.getByRole('button', { name: 'Telepítés' });
  assert.equal(await install.count(), 0, 'no button before the browser offers installing');
  // Chrome's offer, as Chrome sends it once the site has been used for a while.
  await page.evaluate(() => {
    const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt(): Promise<void> };
    offer.prompt = async () => void ((window as Window & { prompted?: boolean }).prompted = true);
    window.dispatchEvent(offer);
  });
  await install.click();
  assert.equal(await page.evaluate(() => (window as Window & { prompted?: boolean }).prompted), true);
  await install.waitFor({ state: 'detached' });
  await page.context().close();

  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const apple = await openPlanner({ userAgent: iphone });
  await apple.page.getByRole('button', { name: 'Telepítés' }).click();
  await apple.page.getByRole('dialog').getByText('Hozzáadás a Főképernyőhöz').waitFor();
  await apple.page.context().close();
  assert.deepEqual([...errors, ...apple.errors], []);
});
