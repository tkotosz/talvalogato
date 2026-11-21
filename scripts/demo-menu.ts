// Writes the invented demo menu as JSON files, in the same shape as refresh-menu: weeks.json and one <week>.json per
// week. It does not contact Teletál. Usage: npm run demo-menu -- --out <folder>
import { parseArgs } from 'node:util';
import { demoMenu } from '../src/scraper/demo.ts';
import { writeMenuFiles } from '../src/scraper/files.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass the output folder with --out <folder>.');

const { weeks, menus } = demoMenu(new Date());
for (const { week, dishes } of menus) console.log(`${week}: ${dishes.length} invented dishes`);
await writeMenuFiles(values.out, weeks, menus);
