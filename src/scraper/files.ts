import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MenuWeek, MenuWeeks } from '../core/types.ts';
import { weekKeyPattern } from '../core/weeks.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

/** Writes weeks.json and one <week>.json per menu, and removes the files of weeks no longer published. */
export async function writeMenuFiles(folder: string, weeks: MenuWeeks, menus: MenuWeek[]): Promise<void> {
  const files = new Map(menus.map(menu => [`${menu.week}.json`, json(menu)]));
  files.set('weeks.json', json(weeks));
  await mkdir(folder, { recursive: true });
  for (const [name, content] of files) await writeFile(join(folder, name), content);
  for (const name of await readdir(folder)) {
    const week = name.replace(/\.json$/, '');
    if (weekKeyPattern.test(week) && !files.has(name)) {
      await rm(join(folder, name));
      console.log(`${week}: no longer published, removed`);
    }
  }
}
