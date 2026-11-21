// Walks through the planner in Chrome at phone width against the live Teletál menu.
// Run with `npm run test:e2e`. Set TALVALOGATO_CHROME to use a browser other than the installed Chrome.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright-core';

const port = 4198;
const base = `http://127.0.0.1:${port}/`;
const screenshots = new URL('./screenshots/', import.meta.url).pathname;
let server: ChildProcess;
let browser: Browser;

before(async () => {
  server = spawn(process.execPath, ['scripts/dev.mjs'], {
    env: { ...process.env, TALVALOGATO_PORT: String(port) },
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
});

async function openPlanner(): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
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
async function decide(page: Page, deck: string, decision: 'Kiválasztom' | 'Nap kihagyása') {
  const day = (await currentDay(page))?.split(',')[0] ?? '';
  if (decision === 'Nap kihagyása') {
    await page.getByRole('button', { name: 'Nap kihagyása' }).click();
  } else {
    await page.getByRole('button', { name: deck }).click();
    await waitForDeck(page);
    await page.getByRole('button', { name: 'Kiválasztom' }).click();
  }
  // The overview opens by itself after the last day's decision.
  const expected = `${day}, ${decision === 'Kiválasztom' ? 'étel kiválasztva' : 'kihagyva'}`;
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
    if (index === 1) await decide(page, '', 'Nap kihagyása');
    else await decide(page, weekend ? 'Teletál egész napos menük' : 'Teletál ebéd menük', 'Kiválasztom');
    if (index === 0) await page.screenshot({ path: `${screenshots}deck.png`, fullPage: true });
  }

  await page.locator('.review').waitFor();
  assert.equal(await page.locator('.review-row').count(), days);
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
  assert.deepEqual(errors, []);
});

test('settings, editing from the overview, resuming and switching weeks', async () => {
  const { page, errors } = await openPlanner();
  await page.getByRole('button', { name: 'Válogatás indítása' }).click();
  const firstDay = (await currentDay(page))?.split(',')[0] ?? '';
  await decide(page, 'Teletál egész napos menük', 'Kiválasztom');

  await page.getByRole('button', { name: 'Beállítások' }).click();
  await page.getByLabel('Napi kalóriakeret').check();
  await page.locator('#target').fill('1000');
  await page.screenshot({ path: `${screenshots}settings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mentés' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Áttekintés' }).click();
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
    await page.getByRole('button', { name: 'Válogatás indítása' }).click();
    assert.equal(await page.locator('dialog[open] h2').innerText(), 'Új heti tervet indítasz?');
    await page.getByRole('button', { name: 'Mégse' }).click();
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
  await decide(page, 'Teletál ebéd menük', 'Kiválasztom');

  // The custom day: components first, then the overview where each component gets its dish.
  await page.getByRole('button', { name: 'Saját menük' }).click();
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

  await page.getByRole('button', { name: 'Áttekintés' }).click();
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

  await page.getByRole('button', { name: 'Áttekintés' }).click();
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
  await page.getByRole('button', { name: 'Saját menük' }).click();
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
  await page.getByRole('button', { name: 'Áttekintés' }).click();
  const row = page.locator('.review-row', { hasText: 'Saját menü' });
  await row.waitFor();
  if (nothingFits) assert.match(await row.innerText(), /Kereten felül, engedélyezve/);
  assert.equal(await page.getByRole('button', { name: 'Kosárhoz adás' }).isDisabled(), false);
  assert.deepEqual(errors, []);
});
