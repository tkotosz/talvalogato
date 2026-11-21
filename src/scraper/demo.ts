import { nextRandom } from '../core/generate.ts';
import type { CourseKind, CustomCourse, Day, Dish, DishKind, MenuWeek, MenuWeeks, WeekKey } from '../core/types.ts';
import { addDays, isoWeek, mondayOfWeek, todayInBudapest } from '../core/weeks.ts';

// Invented menus for the demo: made-up dishes, prices and calories in the shape of the real menu data, without photos.
// The Menu data workflow writes them instead of reading Teletál. A week's menu depends only on its key, so the files
// change only when the published weeks do.

type Entry = [name: string, kcal: number, price: number];

const soups: Entry[] = [
  ['Zöldborsóleves (galuskával)', 210, 890],
  ['Paradicsomleves (betűtésztával)', 190, 850],
  ['Csontleves (cérnametélttel, zöldségekkel)', 240, 950],
  ['Sütőtökkrémleves (pirított tökmaggal)', 260, 990],
  ['Bableves (füstölt csülökkel)', 430, 1290],
  ['Gombakrémleves', 280, 990],
  ['Karfiolleves (tejföllel)', 230, 920],
  ['Lencseleves (virslivel)', 390, 1190],
  ['Brokkolikrémleves (sajtos pirítóssal)', 310, 1050],
  ['Krumplileves (kolbásszal)', 350, 1090],
  ['Hideg meggyleves', 270, 1090],
  ['Zöldséges raguleves (csirkehússal)', 290, 1150],
];

const mains: Entry[] = [
  ['Rántott csirkemell (petrezselymes burgonyával)', 820, 2490],
  ['Paprikás csirke (nokedlivel)', 760, 2390],
  ['Sertéspörkölt (tarhonyával)', 840, 2590],
  ['Rakott krumpli', 720, 2190],
  ['Töltött paprika (főtt burgonyával)', 690, 2290],
  ['Grillezett lazac (párolt zöldségekkel)', 540, 3290],
  ['Bolognai spagetti', 780, 2190],
  ['Zöldséges rizottó (parmezánnal)', 610, 2090],
  ['Csirkés-brokkolis penne', 650, 2190],
  ['Rántott sajt (rizzsel, tartármártással)', 880, 2390],
  ['Lecsó (kolbásszal, kenyérrel)', 590, 1890],
  ['Sült csirkecomb (hagymás törtburgonyával)', 810, 2490],
  ['Babgulyás', 620, 2090],
  ['Mákos tészta', 690, 1690],
  ['Tökfőzelék (fasírttal)', 640, 2090],
  ['Sajtos-tejfölös lasagne', 830, 2390],
  ['Pulykamell (grillezett zöldségekkel)', 470, 2590],
  ['Vegán csicseriborsó-curry (barna rizzsel)', 560, 2190],
];

const desserts: Entry[] = [
  ['Túrós rétes', 330, 790],
  ['Almás pite', 380, 790],
  ['Csokoládés muffin', 420, 690],
  ['Gyümölcsjoghurt', 180, 590],
  ['Somlói galuska', 470, 990],
  ['Palacsinta (barackízzel)', 360, 790],
];

const breakfasts: Entry[] = [
  ['Zabkása (áfonyával)', 340, 990],
  ['Sonkás-sajtos melegszendvics', 450, 1190],
  ['Rántotta (pirítóssal)', 410, 1090],
  ['Túrókrémes kifli', 380, 890],
];

const colds: Entry[] = [
  ['Franciasaláta', 360, 1190],
  ['Tonhalas tésztasaláta', 420, 1390],
  ['Görög saláta', 260, 1290],
];

const pickles: Entry[] = [
  ['Csemegeuborka', 40, 390],
  ['Káposztasaláta', 70, 390],
  ['Ecetes paprika', 35, 390],
];

const breads: Entry[] = [
  ['Teljes kiőrlésű cipó', 270, 490],
  ['Burgonyás cipó', 310, 490],
];

const drinks: Entry[] = [
  ['Házi limonádé', 120, 690],
  ['Szénsavmentes ásványvíz', 0, 290],
  ['Narancslé', 140, 590],
];

/** Single dishes for custom days: their course, the code that marks them on every day, and how many each day offers. */
const singles: { course: CustomCourse; kind: DishKind; codePrefix: string; category: string; pool: Entry[]; count: number }[] = [
  { course: 'breakfast', kind: 'main', codePrefix: 'R', category: 'Reggeli', pool: breakfasts, count: 2 },
  { course: 'soup', kind: 'soup', codePrefix: 'L', category: 'Levesek', pool: soups, count: 4 },
  { course: 'main', kind: 'main', codePrefix: 'F', category: 'Főételek', pool: mains, count: 6 },
  { course: 'cold', kind: 'main', codePrefix: 'H', category: 'Hidegkonyha', pool: colds, count: 2 },
  { course: 'pickle', kind: 'main', codePrefix: 'S', category: 'Savanyúság', pool: pickles, count: 2 },
  { course: 'bread', kind: 'main', codePrefix: 'C', category: 'Pékáru', pool: breads, count: 2 },
  { course: 'dessert', kind: 'dessert', codePrefix: 'D', category: 'Desszertek', pool: desserts, count: 3 },
  { course: 'drink', kind: 'main', codePrefix: 'I', category: 'Italok', pool: drinks, count: 2 },
];

const courseKinds: Record<CustomCourse, CourseKind> = {
  breakfast: 'side',
  soup: 'soup',
  main: 'main',
  cold: 'side',
  pickle: 'side',
  bread: 'side',
  dessert: 'dessert',
  drink: 'side',
};

/** Lunch sets: a soup and a main course. */
const lunchCodes = ['A', 'B', 'C', 'D'];
/** Whole-day sets. The app recognizes whole-day menus by these codes, so the demo uses the same ones. */
const fullDayCodes = [
  { code: 'Z10', menuName: 'Egész napos menü' },
  { code: 'Z11', menuName: 'Könnyű egész napos menü' },
];
const weekdays: Day[] = [1, 2, 3, 4, 5];
const weekendDays: Day[] = [6, 7];
/** The current week and the three after it, as Teletál publishes them. */
const publishedWeekCount = 4;

/** The weeks the demo publishes on `now`. */
export function demoWeekKeys(now: Date): WeekKey[] {
  const today = todayInBudapest(now);
  return Array.from({ length: publishedWeekCount }, (_, index) => isoWeek(addDays(today, index * 7)));
}

/** The demo's published weeks and their menus. */
export function demoMenu(now: Date): { weeks: MenuWeeks; menus: MenuWeek[] } {
  const keys = demoWeekKeys(now);
  return {
    weeks: { updatedAt: now.toISOString(), demo: true, weeks: keys.map(key => ({ key })) },
    menus: keys.map(key => ({ week: key, dishes: demoDishes(key) })),
  };
}

/** One week's invented dishes. */
export function demoDishes(week: WeekKey): Dish[] {
  if (!mondayOfWeek(week)) throw new RangeError(`Invalid week ${week}`);
  const random = seededRandom(week);
  const dishes: Dish[] = [];
  for (const day of weekdays) {
    for (const code of lunchCodes) dishes.push(setMenu(day, code, `${code} menü`, [pick(random, soups), pick(random, mains)]));
    for (const { code, menuName } of fullDayCodes) dishes.push(fullDayMenu(random, day, code, menuName));
    for (const single of singles) {
      shuffled(random, single.pool)
        .slice(0, single.count)
        .forEach((entry, index) => dishes.push(singleDish(day, single, `${single.codePrefix}${index + 1}`, entry)));
    }
  }
  // Weekend meals arrive with Friday's delivery; only the whole-day sets have their own weekend lines.
  for (const day of weekendDays) {
    for (const { code, menuName } of fullDayCodes) dishes.push({ ...fullDayMenu(random, day, code, menuName), weekend: true });
  }
  return dishes;
}

function singleDish(day: Day, single: (typeof singles)[number], code: string, [name, kcal, price]: Entry): Dish {
  return {
    ...line(day, code, name, price),
    kind: single.kind,
    section: single.category,
    groupId: single.category,
    category: single.category,
    menuName: single.category,
    pickerEligible: single.course !== 'drink',
    course: single.course,
    kcal,
    components: [{ name, kcal, kind: courseKinds[single.course], photo: null }],
  };
}

function fullDayMenu(random: () => number, day: Day, code: string, menuName: string): Dish {
  const breakfast = pick(random, breakfasts);
  const [lunch, dinner] = shuffled(random, mains);
  return setMenu(day, code, menuName, [breakfast, pick(random, soups), lunch!, dinner!], ['side', 'soup', 'main', 'main']);
}

/** A set menu whose name lists its courses, separated by slashes as Teletál writes them. */
function setMenu(day: Day, code: string, menuName: string, courses: Entry[], kinds: CourseKind[] = ['soup', 'main']): Dish {
  const name = courses.map(([courseName]) => courseName).join(' / ');
  // A set costs less than its dishes bought one by one.
  const price = Math.round((courses.reduce((sum, [, , coursePrice]) => sum + coursePrice, 0) * 0.85) / 100) * 100 - 10;
  return {
    ...line(day, code, name, price),
    kind: 'menu',
    section: 'Menük',
    groupId: 'Menük',
    category: 'Menük',
    menuName,
    pickerEligible: true,
    course: null,
    kcal: courses.reduce((sum, [, kcal]) => sum + kcal, 0),
    components: courses.map(([courseName, kcal], index) => ({ name: courseName, kcal, kind: kinds[index], photo: null })),
  };
}

function line(day: Day, code: string, name: string, price: number) {
  return { id: `${day}:1:${code}`, day, type: 1, code, name, price, cuisine: null, weekend: false, note: null, photo: null };
}

/** A random sequence that always starts the same for the same week. */
function seededRandom(week: WeekKey): () => number {
  let seed = [...week].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261);
  return () => {
    const next = nextRandom(seed);
    seed = next.seed;
    return next.value;
  };
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function shuffled<T>(random: () => number, items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}
