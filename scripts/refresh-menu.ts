// Reads the published weeks and their menus from Teletál and writes them as JSON files:
// weeks.json and one <week>.json per week. Usage: npm run refresh-menu -- --out <folder>
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Dish, MenuWeek, MenuWeeks } from '../src/core/types.ts';
import { weekKeyPattern } from '../src/core/weeks.ts';
import { buildWeek } from '../src/scraper/refresh.ts';
import { menuCatalog, nutritionFor, publishedWeeks } from '../src/scraper/teletal.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass the output folder with --out <folder>.');
const folder = values.out;

async function previousDishes(week: string): Promise<Dish[]> {
  try {
    return (JSON.parse(await readFile(join(folder, `${week}.json`), 'utf8')) as MenuWeek).dishes;
  } catch {
    return [];
  }
}

/** Teletál's dish pages are read in batches, like the app read them, to keep the load on Teletál even. */
async function readDetails(week: string, ids: string[]) {
  const details = [];
  for (let start = 0; start < ids.length; start += 8) details.push(...(await nutritionFor(week, ids.slice(start, start + 8))));
  return details;
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const updatedAt = new Date().toISOString();

// Everything is read before anything is written, so a failed run leaves the previous data untouched.
const weeks = await publishedWeeks();
const files = new Map<string, string>();
for (const { key } of weeks) {
  const catalog = await menuCatalog(key);
  const dishes = await buildWeek(key, catalog, await previousDishes(key), readDetails);
  const missing = dishes.filter(dish => dish.kcal === null).length;
  console.log(`${key}: ${dishes.length} dishes, ${missing} without calorie data`);
  files.set(`${key}.json`, json({ week: key, dishes } satisfies MenuWeek));
}
files.set('weeks.json', json({ updatedAt, weeks } satisfies MenuWeeks));

await mkdir(folder, { recursive: true });
for (const [name, content] of files) await writeFile(join(folder, name), content);
for (const name of await readdir(folder)) {
  const week = name.replace(/\.json$/, '');
  if (weekKeyPattern.test(week) && !files.has(name)) {
    await rm(join(folder, name));
    console.log(`${week}: no longer published, removed`);
  }
}
