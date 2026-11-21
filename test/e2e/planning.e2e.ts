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
  await page.getByRole('button', { name: 'Tovább' }).click();
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
  await page.getByRole('button', { name: 'Tovább' }).click();
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
  await page.getByRole('button', { name: 'Tovább' }).click();
  assert.match((await currentDay(page)) ?? '', /étel kiválasztva/);

  await page.getByRole('button', { name: 'Hét', exact: true }).click();
  const weeks = await page
    .locator('#week option')
    .evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  if (weeks.length > 1) {
    await page.locator('#week').selectOption(weeks[1]!);
    await waitForWeek(page);
    await page.getByRole('button', { name: 'Tovább' }).click();
    assert.equal(await page.locator('dialog[open] h2').innerText(), 'Új heti tervet indítasz?');
    await page.getByRole('button', { name: 'Mégse' }).click();
  }
  assert.deepEqual(errors, []);
});
