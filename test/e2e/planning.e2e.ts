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
  server = await startServer(port);
  await mkdir(screenshots, { recursive: true });
  const executablePath = process.env.TALVALOGATO_CHROME;
  browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
});

/** Starts the dev server on the demo menu and waits until it answers. */
async function startServer(serverPort: number): Promise<ChildProcess> {
  const started = spawn(process.execPath, ['scripts/dev.mjs'], {
    env: { ...process.env, TALVALOGATO_PORT: String(serverPort), TALVALOGATO_MENU_DIR: menuDir },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`http://127.0.0.1:${serverPort}/`).catch(() => null);
    if (response?.ok) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return started;
}

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

/** Moves on with Következő nap and waits until the day strip shows the next day. */
async function nextDay(page: Page) {
  const day = (await currentDay(page))?.split(',')[0] ?? '';
  await page.locator('.step-bar').getByRole('button', { name: 'Következő nap' }).click();
  await page.waitForFunction(
    before => !document.querySelector('.week-progress [aria-current]')?.getAttribute('aria-label')?.startsWith(before),
    day,
  );
}

/** Adds empty rows to the day's tray with its add buttons. */
async function addRows(page: Page, ...rows: string[]) {
  for (const row of rows) await page.locator('.tray-add').getByRole('button', { name: row, exact: true }).click();
}

/**
 * Adds a Teletál menü row, picks the top set menu of its deck, and moves on to the next day when there is one, which saves
 * the day; on the last day, leaving it later saves it. Or only moves on, leaving the day without a decision.
 */
async function decide(page: Page, decision: 'Kiválasztom' | 'Következő nap') {
  if (decision === 'Következő nap') return nextDay(page);
  const day = (await currentDay(page))?.split(',')[0] ?? '';
  await addRows(page, 'Teletál menü');
  await page.locator('.tray-row button', { hasText: 'Teletál menü' }).first().click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary', { hasText: 'Teletál menü' }).waitFor();
  if ((await page.locator('.step-bar').getByRole('button', { name: 'Következő nap' }).count()) === 0) return;
  await nextDay(page);
  await page.locator(`.week-progress button[aria-label="${day}, étel kiválasztva"]`).waitFor({ timeout: 5_000 });
}

test('a whole week across both decks reaches the overview and the cart link', async () => {
  const { page, errors } = await openPlanner();
  await page.screenshot({ path: `${screenshots}week.png`, fullPage: true });
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  const days = await page.locator('.week-progress button:not(:disabled)').count();
  assert.ok(days > 0, 'the week has orderable days');
  await page.screenshot({ path: `${screenshots}tray-empty.png`, fullPage: true });

  for (let index = 0; index < days; index++) {
    if (index === 1) await decide(page, 'Következő nap');
    else await decide(page, 'Kiválasztom');
    if (index === 0) await page.screenshot({ path: `${screenshots}deck.png`, fullPage: true });
  }

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
  await decide(page, 'Kiválasztom');

  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Napi kalóriakeret').check();
  await page.locator('#target').fill('700');
  await page.screenshot({ path: `${screenshots}settings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  assert.match(await page.locator('.review-row').first().innerText(), /Kalóriakereten felül/);

  await page.locator('.review-row').first().click();
  assert.ok((await currentDay(page))?.startsWith(firstDay));
  // Editing opens the day's tray with its set menu.
  await page.getByRole('button', { name: 'Nap szerkesztése' }).click();
  await page.locator('.custom-summary', { hasText: 'Teletál menü' }).waitFor();

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
    await page.locator('.custom-step').waitFor();
    await page.locator('.step-progress').getByRole('button', { name: 'Hét' }).click();
    await page.locator('#week').selectOption(weeks[0]!);
    await waitForWeek(page);
    await page.getByRole('button', { name: 'Folytatás' }).click();
    assert.match((await currentDay(page)) ?? '', /étel kiválasztva/);
  }
  assert.deepEqual(errors, []);
});

/** Opens a core course from the day's tray, picks its top dish in the deck, and waits for the tray again. */
async function pickFromOverview(page: Page, component: string) {
  await page.locator('.custom-summary button', { hasText: component }).first().click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
}

/** Adds an extra's empty row, opens it, taps the first dish of its list, and waits for the tray again. */
async function addExtra(page: Page, extra: string) {
  await page.locator('.tray-add').getByRole('button', { name: extra }).click();
  await page.locator('.tray-row button', { hasText: extra }).first().click();
  await page.locator('.extra-list button').first().click();
  await page.locator('.custom-summary').waitFor();
}

test('a set menu with an extra, a day built course by course with a removed row, and an edit', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();

  // The day opens on an empty tray; a set menu goes onto it, and an extra joins it from a list.
  assert.equal(await page.locator('.custom-summary').count(), 0);
  await addRows(page, 'Teletál menü');
  await page.locator('.tray-row button', { hasText: 'Teletál menü' }).first().click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary', { hasText: 'Teletál menü' }).waitFor();
  await addRows(page, 'Reggeli');
  assert.match(await page.locator('.tray-row').first().innerText(), /Reggeli/, 'breakfast comes first');
  await page.getByRole('button', { name: 'Reggeli eltávolítása' }).click();
  await page.locator('.tray-add').getByRole('button', { name: 'Savanyúság' }).click();
  await page.locator('.tray-row button', { hasText: 'Savanyúság' }).first().click();
  await page.locator('.extra-list').waitFor();
  await page.screenshot({ path: `${screenshots}tray-extra-list.png`, fullPage: true });
  await page.locator('.extra-list button').first().click();
  await page.locator('.custom-summary', { hasText: 'Savanyúság' }).waitFor();
  // Two portions of the pickle: its row's stepper, then the total and the finished day count both.
  const pickleRow = page.locator('.tray-row', { hasText: 'Savanyúság' });
  const totalBefore = await page.locator('.custom-total strong').innerText();
  await pickleRow.getByRole('button', { name: 'Eggyel több adag' }).click();
  await pickleRow.locator('output', { hasText: '2' }).waitFor();
  assert.notEqual(await page.locator('.custom-total strong').innerText(), totalBefore, 'the total counts both portions');
  await page.screenshot({ path: `${screenshots}tray-menu.png`, fullPage: true });
  const firstDay = (await currentDay(page))?.split(',')[0] ?? '';
  await page.getByRole('button', { name: 'Kész', exact: true }).click();
  await page.getByRole('button', { name: 'Nap szerkesztése' }).waitFor();
  assert.ok((await currentDay(page))?.startsWith(`${firstDay}, étel kiválasztva`), 'Kész saves and stays on the day');
  assert.match(await page.locator('.meal-card h2').innerText(), /kiegészítőkkel/);
  assert.match(await page.locator('.meal-card .course-list').innerText(), /2 × /);
  await nextDay(page);

  // Course by course: soup and main rows are added, an extra too, and the soup row is emptied and removed. Going to
  // the overview without Kész saves the day.
  await addRows(page, 'Leves', 'Főétel');
  assert.equal(await page.locator('.custom-summary .custom-empty').count(), 2);
  assert.equal(await page.getByRole('button', { name: 'Kész', exact: true }).isDisabled(), true);
  await pickFromOverview(page, 'Leves');
  await pickFromOverview(page, 'Főétel');
  await addExtra(page, 'Desszert');
  // A filled row is emptied first, and an empty row can be removed.
  await page.getByRole('button', { name: 'Leves ürítése' }).click();
  assert.equal(await page.locator('.tray-row').count(), 3, 'the emptied soup row stays');
  await page.getByRole('button', { name: 'Leves eltávolítása' }).click();
  assert.equal(await page.locator('.tray-row').count(), 2, 'main and dessert');
  await page.screenshot({ path: `${screenshots}tray-courses.png`, fullPage: true });

  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  const withExtra = page.locator('.review-row', { hasText: 'kiegészítőkkel' });
  // The set menu's courses each get a line, like a day of only a set menu, then the pickle.
  const extraItems = await withExtra.locator('.review-item').allInnerTexts();
  assert.ok(extraItems.length >= 3, 'the set menu courses and the pickle');
  assert.ok(
    extraItems.every(item => !item.includes(' / ')),
    'no courses joined on one line',
  );
  const custom = page.locator('.review-row', { hasText: 'Saját menü' });
  assert.equal(await custom.locator('.review-item').count(), 2, 'main and dessert');

  // Editing swaps the main, and leaving the day saves it.
  await custom.click();
  await page.getByRole('button', { name: 'Nap szerkesztése' }).click();
  const mainBefore = await page.locator('.custom-summary button', { hasText: 'Főétel' }).first().innerText();
  await page.locator('.custom-summary button', { hasText: 'Főétel' }).first().click();
  await waitForDeck(page);
  await page.getByRole('button', { name: 'Passz' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
  assert.notEqual(await page.locator('.custom-summary button', { hasText: 'Főétel' }).first().innerText(), mainBefore);

  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.getByRole('button', { name: 'Kosárhoz adás' }).click();
  const link = page.locator('dialog[open] a.button.primary');
  await link.waitFor({ timeout: 30_000 });
  const encoded = (await link.getAttribute('href'))!.split('#talvalogato=')[1]!;
  const cartLinks: [number, string, number][] = JSON.parse(Buffer.from(encoded, 'base64url').toString()).lines;
  assert.equal(cartLinks.length, 4, 'a set menu and three dishes');
  assert.deepEqual(cartLinks.map(([, , quantity]) => quantity).sort(), [1, 1, 1, 2], 'the pickle goes to the cart twice');
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
  await page.getByText('Szűrők:').waitFor();
  await page.screenshot({ path: `${screenshots}week-filters.png`, fullPage: true });
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  const text = async (selector: string) => (await page.locator(selector).innerText()).replace(/\s/g, '');
  assert.match(await text('.day-calories'), /^Ma0kcal·még700kcalanapikeretből$/);
  await addRows(page, 'Leves', 'Főétel');
  await pickFromOverview(page, 'Leves');

  await page.locator('.custom-summary button', { hasText: 'Főétel' }).first().click();
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
  assert.match(await text('.day-calories'), nothingFits ? /kcal-valanapikeretfelett$/ : /^Ma\d+kcal·még\d+kcalanapikeretből$/);
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  const row = page.locator('.review-row', { hasText: 'Saját menü' });
  await row.waitFor();
  if (nothingFits) assert.match(await row.innerText(), /Kereten felül, engedélyezve/);
  assert.equal(await page.getByRole('button', { name: 'Kosárhoz adás' }).isDisabled(), false);
  assert.deepEqual(errors, []);
});

test('a weekly spending limit shows what is left, hides what does not fit, and still lets the week go to the cart', async () => {
  const { page, errors } = await openPlanner();
  const text = async (selector: string) => (await page.locator(selector).innerText()).replace(/\s/g, '');
  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Heti költségkeret').check();
  // Every demo soup costs at least 850 Ft and every main at least 1,690 Ft, so no main fits next to a soup.
  await page.locator('#weekly-budget').fill('2500');
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.match(await text('.filter-summary'), /hetiköltségkeret/);
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  assert.match(await text('.week-spending'), /^Eddig0Ft·még2500Ftahetikeretből$/);

  await addRows(page, 'Leves', 'Főétel');
  await pickFromOverview(page, 'Leves');
  await page.locator('.custom-summary button', { hasText: 'Főétel' }).first().click();
  await waitForDeck(page);
  await page.getByRole('heading', { name: 'Nincs a keretbe férő választás' }).waitFor();
  assert.match(await text('.placeholder-card'), /hetiköltségkeretedből/);
  await page.getByRole('button', { name: 'Mutasd a kereten felülieket is' }).click();
  await waitForDeck(page);
  assert.equal(await page.locator('.swipe-card .price-badge.over-target').count(), 1);
  await page.screenshot({ path: `${screenshots}spending-deck.png`, fullPage: true });
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
  assert.match(await text('.week-spending'), /Ft-talahetikeretfelett$/);

  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review').waitFor();
  assert.match(await text('.review-spending'), /hetiköltségkereted\(2500Ft\)felettvagy/);
  await page.screenshot({ path: `${screenshots}spending-overview.png`, fullPage: true });
  assert.equal(await page.getByRole('button', { name: 'Kosárhoz adás' }).isDisabled(), false);
  assert.deepEqual(errors, []);
});

test('an idea fills soup and main within the calorie limit, and a kept idea stays on the tray', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Napi kalóriakeret').check();
  await page.locator('#target').fill('1500');
  await page.locator('#tolerance').fill('0');
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();

  await addRows(page, 'Leves', 'Főétel');
  await page.getByRole('button', { name: 'Dobj egy ötletet' }).click();
  const card = page.locator('.swipe-card');
  await card.waitFor();
  assert.match(await card.innerText(), /Ötlet a napodhoz/);
  assert.equal(await card.locator('.course-list li').count(), 2, 'soup and main');
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

  // Vissza returns to the empty tray; a new idea and Kiválasztom keep it on the tray, where an extra can join.
  await page.locator('.step-bar').getByRole('button', { name: 'Vissza' }).click();
  assert.equal(await page.locator('.custom-summary .custom-empty').count(), 2);
  await page.getByRole('button', { name: 'Dobj egy ötletet' }).click();
  await card.waitFor();
  const accepted = await card.locator('.course-list').innerText();
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();
  assert.equal(await page.locator('.tray-row').count(), 2);
  await addExtra(page, 'Ital');
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  const row = page.locator('.review-row', { hasText: 'Saját menü' });
  await row.waitFor();
  assert.equal(await row.locator('.review-item').count(), 3);
  for (const line of accepted.split('\n').filter(part => /^[A-Z0-9]+$/.test(part.trim()))) {
    assert.match(await row.innerText(), new RegExp(line.trim()));
  }
  await page.screenshot({ path: `${screenshots}generated-overview.png`, fullPage: true });
  assert.deepEqual(errors, []);
});

test('diet and allergen filters: decks follow the filters, and ordering reminds to check allergens', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Vegán').check();
  await page.getByLabel('Allergének kizárása').check();
  // The demo has two vegan mains a day, and at most one of them has sesame.
  await page.getByLabel('Szezámmag').check();
  await page.screenshot({ path: `${screenshots}diet-settings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });

  // Teletál's set menus are not vegan, so their add button is off, and a note says why.
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  assert.equal(await page.locator('.tray-add').getByRole('button', { name: 'Teletál menü' }).isDisabled(), true);
  await page.getByText(/A beállításaid miatt ma nem választható:.*teletál menü/).waitFor();
  await page.screenshot({ path: `${screenshots}diet-tray.png`, fullPage: true });

  await addRows(page, 'Főétel');
  await page.locator('.custom-summary button', { hasText: 'Főétel' }).first().click();
  await waitForDeck(page);
  const card = page.locator('.meal-card').first();
  assert.equal(await card.locator('.tag-mark', { hasText: /^Vegán$/ }).count(), 1);
  const allergens = await card.locator('.meal-allergens').innerText();
  assert.match(allergens, /^Allergének a Teletál szerint:/);
  assert.doesNotMatch(allergens, /szezámmag/);
  const teletal = card.getByRole('link', { name: /Ellenőrzés a Teletálon/ });
  assert.match((await teletal.getAttribute('href'))!, /^https:\/\/www\.teletal\.hu\/etlap\/\d+#VF\d_\d$/);
  await page.screenshot({ path: `${screenshots}diet-card.png`, fullPage: true });
  await page.getByRole('button', { name: 'Kiválasztom' }).click();
  await page.locator('.custom-summary').waitFor();

  // Before ordering, the overview and the cart dialog both ask to check the allergens and prices on Teletál.
  await page.locator('.step-progress').getByRole('button', { name: 'Áttekintés' }).click();
  await page.locator('.review .order-reminder', { hasText: 'allergénjeit és árait' }).waitFor();
  await page.getByRole('button', { name: 'Kosárhoz adás' }).click();
  const reminder = page.locator('dialog[open] .order-reminder');
  await reminder.waitFor({ timeout: 30_000 });
  const openMenu = page.locator('dialog[open] a.button.primary');
  assert.ok((await reminder.boundingBox())!.y < (await openMenu.boundingBox())!.y, 'the reminder sits above the cart button');
  assert.deepEqual(errors, []);
});

test('the demo says so and leaves out the cart', async () => {
  const { page, errors } = await openPlanner({ demo: true });
  assert.match(await page.locator('.demo-banner').innerText(), /Bemutató változat/);
  assert.equal(await page.locator('.menu-updated').count(), 0);
  assert.doesNotMatch(await page.locator('.unofficial-notice').innerText(), /Teletál tulajdonai/);
  await page.screenshot({ path: `${screenshots}demo-week.png`, fullPage: true });

  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  await decide(page, 'Kiválasztom');
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

test('with the server down, the app comes from its current cache, and the first versions’ caches are removed', async () => {
  // A server of its own, so it can be stopped like a server that went away.
  const ownPort = port + 1;
  const ownBase = `http://127.0.0.1:${ownPort}/`;
  const ownServer = await startServer(ownPort);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // Caches made before the service worker installs, so they are older than its own: one named like the first versions'
  // caches, which activation removes, and one it does not know, which the fallback must not read.
  await page.goto(`${ownBase}manifest.webmanifest`);
  await page.evaluate(async () => {
    const page = (text: string) => new Response(`<p id="old">${text}</p>`, { headers: { 'Content-Type': 'text/html' } });
    await (await caches.open('meal-deck-old')).put('/', page('First version'));
    await (await caches.open('unknown-old')).put('/', page('Unknown cache'));
  });
  await page.goto(ownBase);
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!(await page.evaluate(() => caches.keys())).includes('meal-deck-old')) break;
    await page.waitForTimeout(100);
  }
  assert.ok(!(await page.evaluate(() => caches.keys())).includes('meal-deck-old'), 'the first versions’ cache is removed');

  ownServer.kill();
  await new Promise(resolve => ownServer.once('exit', resolve));
  await page.reload();
  assert.equal(await page.locator('#old').count(), 0, 'the page comes from the current cache');
  await page.locator('.app-header').waitFor();
  await context.close();
});
