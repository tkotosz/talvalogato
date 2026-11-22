// Reads the published weeks and their menus from Teletál and writes them as JSON files:
// weeks.json and one <week>.json per week. Usage: npm run refresh-menu -- --out <folder> [--reread-details]
// --reread-details reads every dish page again instead of reusing unchanged lines, so corrections Teletál makes arrive.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Dish, MenuWeek, MenuWeeks } from '../src/core/types.ts';
import { writeMenuFiles } from '../src/scraper/files.ts';
import { allergenCoverage, buildWeek, minAllergenCoverage } from '../src/scraper/refresh.ts';
import { detailsFor, menuCatalog, publishedWeeks } from '../src/scraper/teletal.ts';

const { values } = parseArgs({ options: { out: { type: 'string' }, 'reread-details': { type: 'boolean', default: false } } });
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
  for (let start = 0; start < ids.length; start += 8) details.push(...(await detailsFor(week, ids.slice(start, start + 8))));
  return details;
}

const updatedAt = new Date().toISOString();

// Everything is read before anything is written, so a failed run leaves the previous data untouched.
const weeks = await publishedWeeks();
const menus: MenuWeek[] = [];
for (const { key } of weeks) {
  const catalog = await menuCatalog(key);
  const dishes = await buildWeek(key, catalog, await previousDishes(key), readDetails, { reread: values['reread-details'] });
  const missing = dishes.filter(dish => dish.kcal === null).length;
  const { known, courses } = allergenCoverage(dishes);
  console.log(
    `${key}: ${dishes.length} dishes, ${missing} without calorie data, allergens known for ${known} of ${courses} courses`,
  );
  menus.push({ week: key, dishes });
}
const { known, courses } = allergenCoverage(menus.flatMap(menu => menu.dishes));
if (courses && known < courses * minAllergenCoverage) {
  throw new Error(
    `Allergens are known for only ${known} of ${courses} courses; Teletál's pages may have changed. The previous data was kept.`,
  );
}
await writeMenuFiles(folder, { updatedAt, weeks } satisfies MenuWeeks, menus);
