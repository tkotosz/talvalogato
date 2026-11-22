import { inAllergenOrder } from '../core/allergens.ts';
import { nextRandom } from '../core/generate.ts';
import type {
  Allergen,
  Course,
  CourseKind,
  CustomCourse,
  Day,
  Diet,
  Dish,
  DishKind,
  MenuWeek,
  MenuWeeks,
  WeekKey,
} from '../core/types.ts';
import { addDays, isoWeek, mondayOfWeek, todayInBudapest } from '../core/weeks.ts';

// Invented menus for the demo: made-up dishes, prices, calories, ingredients and allergens in the shape of the real menu data,
// without photos. The Menu data workflow writes them instead of reading Teletál. A week's menu depends only on its key, so the
// files change only when the published weeks do.

/** An invented dish, with the diet and spicy marks Teletál would give it. */
interface Entry {
  name: string;
  kcal: number;
  price: number;
  ingredients: string;
  allergens: Allergen[];
  diet?: Diet;
  spicy?: true;
}

const soups: Entry[] = [
  {
    name: 'Zöldborsóleves (galuskával)',
    kcal: 210,
    price: 890,
    ingredients: 'zöldborsó, sárgarépa, petrezselyem, galuska (búzaliszt, tojás), vaj',
    allergens: ['gluten', 'egg', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Paradicsomleves (betűtésztával)',
    kcal: 190,
    price: 850,
    ingredients: 'paradicsom, zeller, cukor, betűtészta (durumbúzadara)',
    allergens: ['gluten', 'celery'],
    diet: 'vegan',
  },
  {
    name: 'Csontleves (cérnametélttel, zöldségekkel)',
    kcal: 240,
    price: 950,
    ingredients: 'sertéscsont, sárgarépa, zeller, cérnametélt (búzaliszt, tojás)',
    allergens: ['gluten', 'egg', 'celery'],
  },
  {
    name: 'Sütőtökkrémleves (pirított tökmaggal)',
    kcal: 260,
    price: 990,
    ingredients: 'sütőtök, vöröshagyma, kókusztej, gyömbér, tökmag',
    allergens: [],
    diet: 'vegan',
  },
  {
    name: 'Bableves (füstölt csülökkel)',
    kcal: 430,
    price: 1290,
    ingredients: 'tarkabab, füstölt sertéscsülök, sárgarépa, zeller, tejföl, búzaliszt',
    allergens: ['gluten', 'milk', 'celery'],
  },
  {
    name: 'Gombakrémleves',
    kcal: 280,
    price: 990,
    ingredients: 'csiperkegomba, tejszín, vaj, búzaliszt, petrezselyem',
    allergens: ['gluten', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Karfiolleves (tejföllel)',
    kcal: 230,
    price: 920,
    ingredients: 'karfiol, sárgarépa, zeller, tejföl, búzaliszt',
    allergens: ['gluten', 'milk', 'celery'],
    diet: 'vegetarian',
  },
  {
    name: 'Lencseleves (virslivel)',
    kcal: 390,
    price: 1190,
    ingredients: 'lencse, sertésvirsli, vöröshagyma, mustár, babérlevél',
    allergens: ['mustard'],
  },
  {
    name: 'Brokkolikrémleves (sajtos pirítóssal)',
    kcal: 310,
    price: 1050,
    ingredients: 'brokkoli, tejszín, kenyér (búzaliszt), trappista sajt',
    allergens: ['gluten', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Krumplileves (kolbásszal)',
    kcal: 350,
    price: 1090,
    ingredients: 'burgonya, füstölt kolbász, pirospaprika, tejföl, zeller',
    allergens: ['milk', 'celery'],
  },
  {
    name: 'Hideg meggyleves',
    kcal: 270,
    price: 1090,
    ingredients: 'meggy, tejszín, cukor, fahéj, szegfűszeg',
    allergens: ['milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Zöldséges raguleves (csirkehússal)',
    kcal: 290,
    price: 1150,
    ingredients: 'csirkemell, sárgarépa, zöldborsó, zeller, tárkony',
    allergens: ['celery'],
  },
];

const mains: Entry[] = [
  {
    name: 'Rántott csirkemell (petrezselymes burgonyával)',
    kcal: 820,
    price: 2490,
    ingredients: 'csirkemell, búzaliszt, tojás, zsemlemorzsa, burgonya, petrezselyem',
    allergens: ['gluten', 'egg'],
  },
  {
    name: 'Paprikás csirke (nokedlivel)',
    kcal: 760,
    price: 2390,
    ingredients: 'csirkecomb, pirospaprika, tejföl, nokedli (búzaliszt, tojás)',
    allergens: ['gluten', 'egg', 'milk'],
  },
  {
    name: 'Sertéspörkölt (tarhonyával)',
    kcal: 840,
    price: 2590,
    ingredients: 'sertéslapocka, vöröshagyma, pirospaprika, tarhonya (búzaliszt, tojás)',
    allergens: ['gluten', 'egg'],
  },
  {
    name: 'Rakott krumpli',
    kcal: 720,
    price: 2190,
    ingredients: 'burgonya, tojás, füstölt kolbász, tejföl',
    allergens: ['egg', 'milk'],
  },
  {
    name: 'Töltött paprika (főtt burgonyával)',
    kcal: 690,
    price: 2290,
    ingredients: 'paprika, darált sertéshús, rizs, paradicsom, burgonya',
    allergens: [],
  },
  {
    name: 'Grillezett lazac (párolt zöldségekkel)',
    kcal: 540,
    price: 3290,
    ingredients: 'lazac, brokkoli, sárgarépa, citrom, vaj',
    allergens: ['fish', 'milk'],
  },
  {
    name: 'Bolognai spagetti',
    kcal: 780,
    price: 2190,
    ingredients: 'spagetti (durumbúzadara), darált marhahús, paradicsom, sárgarépa, zeller, parmezán',
    allergens: ['gluten', 'milk', 'celery'],
  },
  {
    name: 'Zöldséges rizottó (sajttal)',
    kcal: 610,
    price: 2090,
    ingredients: 'rizs, cukkini, zöldborsó, vaj, trappista sajt, fehérbor',
    allergens: ['milk', 'sulfites'],
    diet: 'vegetarian',
  },
  {
    name: 'Csirkés-brokkolis penne',
    kcal: 650,
    price: 2190,
    ingredients: 'penne (durumbúzadara), csirkemell, brokkoli, tejszín, fokhagyma',
    allergens: ['gluten', 'milk'],
  },
  {
    name: 'Rántott sajt (rizzsel, tartármártással)',
    kcal: 880,
    price: 2390,
    ingredients: 'trappista sajt, búzaliszt, tojás, zsemlemorzsa, rizs, majonéz (tojás, mustár)',
    allergens: ['gluten', 'egg', 'milk', 'mustard'],
    diet: 'vegetarian',
  },
  {
    name: 'Lecsó (kolbásszal, kenyérrel)',
    kcal: 590,
    price: 1890,
    ingredients: 'paprika, paradicsom, vöröshagyma, füstölt kolbász, kenyér (búzaliszt)',
    allergens: ['gluten'],
  },
  {
    name: 'Sült csirkecomb (hagymás törtburgonyával)',
    kcal: 810,
    price: 2490,
    ingredients: 'csirkecomb, burgonya, vöröshagyma, vaj, tej',
    allergens: ['milk'],
  },
  {
    name: 'Babgulyás',
    kcal: 620,
    price: 2090,
    ingredients: 'marhalábszár, tarkabab, burgonya, sárgarépa, zeller, csipetke (búzaliszt, tojás)',
    allergens: ['gluten', 'egg', 'celery'],
  },
  {
    name: 'Mákos tészta',
    kcal: 690,
    price: 1690,
    ingredients: 'tészta (búzaliszt, tojás), mák, porcukor, vaj',
    allergens: ['gluten', 'egg', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Tökfőzelék (fasírttal)',
    kcal: 640,
    price: 2090,
    ingredients: 'tök, kapor, tejföl, búzaliszt, fasírt (darált sertéshús, tojás, zsemle)',
    allergens: ['gluten', 'egg', 'milk'],
  },
  {
    name: 'Sajtos-tejfölös lasagne',
    kcal: 830,
    price: 2390,
    ingredients: 'lasagne tészta (búzaliszt, tojás), darált sertéshús, paradicsom, tejföl, trappista sajt',
    allergens: ['gluten', 'egg', 'milk'],
  },
  {
    name: 'Pulykamell (grillezett zöldségekkel)',
    kcal: 470,
    price: 2590,
    ingredients: 'pulykamell, cukkini, padlizsán, paprika, olívaolaj',
    allergens: [],
  },
];

/** The Vega & vegán section's soups and mains; one soup and two mains are on every weekday. */
const veganSoups: Entry[] = [
  {
    name: 'Sárgarépa-gyömbérkrémleves',
    kcal: 220,
    price: 890,
    ingredients: 'sárgarépa, gyömbér, vöröshagyma, kókusztej, napraforgóolaj',
    allergens: [],
    diet: 'vegan',
  },
  {
    name: 'Lencsés zöldségleves',
    kcal: 260,
    price: 950,
    ingredients: 'vöröslencse, sárgarépa, zeller, paradicsom, kömény',
    allergens: ['celery'],
    diet: 'vegan',
  },
  {
    name: 'Céklakrémleves (tormával)',
    kcal: 200,
    price: 890,
    ingredients: 'cékla, burgonya, torma, almaecet, kókusztej',
    allergens: [],
    diet: 'vegan',
  },
  {
    name: 'Zöldséges gombaleves',
    kcal: 180,
    price: 850,
    ingredients: 'csiperkegomba, sárgarépa, petrezselyemgyökér, zeller, kapor',
    allergens: ['celery'],
    diet: 'vegan',
  },
];

const veganMains: Entry[] = [
  {
    name: 'Csicseriborsó-curry (barna rizzsel)',
    kcal: 560,
    price: 2190,
    ingredients: 'csicseriborsó, kókusztej, paradicsom, spenót, curry, barna rizs',
    allergens: [],
    diet: 'vegan',
  },
  {
    name: 'Lencsefasírt (paradicsomos bulgurral)',
    kcal: 590,
    price: 2090,
    ingredients: 'vöröslencse, zabpehely, bulgur (búza), paradicsom, petrezselyem',
    allergens: ['gluten'],
    diet: 'vegan',
  },
  {
    name: 'Babos chili (jázminrizzsel)',
    kcal: 610,
    price: 2090,
    ingredients: 'vörösbab, kukorica, paprika, paradicsom, chili, jázminrizs',
    allergens: [],
    diet: 'vegan',
    spicy: true,
  },
  {
    name: 'Tofus zöldségragu (kölessel)',
    kcal: 520,
    price: 2190,
    ingredients: 'tofu (szójabab), cukkini, sárgarépa, paprika, köles, szójaszósz (búza)',
    allergens: ['gluten', 'soy'],
    diet: 'vegan',
  },
  {
    name: 'Sült zöldségek (humusszal, pitával)',
    kcal: 640,
    price: 2290,
    ingredients: 'padlizsán, cukkini, paprika, csicseriborsó, tahini (szezámmag), pita (búzaliszt)',
    allergens: ['gluten', 'sesame'],
    diet: 'vegan',
  },
  {
    name: 'Mogyorós pirított rizstészta',
    kcal: 680,
    price: 2190,
    ingredients: 'rizstészta, földimogyoró, brokkoli, sárgarépa, szójaszósz (szójabab, búza), chili',
    allergens: ['gluten', 'peanut', 'soy'],
    diet: 'vegan',
    spicy: true,
  },
];

const desserts: Entry[] = [
  {
    name: 'Túrós rétes',
    kcal: 330,
    price: 790,
    ingredients: 'túró, búzaliszt, tojás, cukor, mazsola',
    allergens: ['gluten', 'egg', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Almás pite',
    kcal: 380,
    price: 790,
    ingredients: 'alma, búzaliszt, vaj, cukor, fahéj',
    allergens: ['gluten', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Csokoládés muffin',
    kcal: 420,
    price: 690,
    ingredients: 'búzaliszt, kakaó, cukor, tojás, vaj, tej',
    allergens: ['gluten', 'egg', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Gyümölcsjoghurt',
    kcal: 180,
    price: 590,
    ingredients: 'joghurt (tej), eper, cukor',
    allergens: ['milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Somlói galuska',
    kcal: 470,
    price: 990,
    ingredients: 'piskóta (búzaliszt, tojás), dió, csokoládé, tejszín, mazsola',
    allergens: ['gluten', 'egg', 'milk', 'nuts'],
    diet: 'vegetarian',
  },
  {
    name: 'Palacsinta (barackízzel)',
    kcal: 360,
    price: 790,
    ingredients: 'búzaliszt, tej, tojás, sárgabarack-íz',
    allergens: ['gluten', 'egg', 'milk'],
    diet: 'vegetarian',
  },
];

const breakfasts: Entry[] = [
  {
    name: 'Zabkása (áfonyával)',
    kcal: 340,
    price: 990,
    ingredients: 'zabpehely, tej, áfonya, méz',
    allergens: ['gluten', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Sonkás-sajtos melegszendvics',
    kcal: 450,
    price: 1190,
    ingredients: 'kenyér (búzaliszt), sertéssonka, trappista sajt, vaj',
    allergens: ['gluten', 'milk'],
  },
  {
    name: 'Rántotta (pirítóssal)',
    kcal: 410,
    price: 1090,
    ingredients: 'tojás, vaj, kenyér (búzaliszt), snidling',
    allergens: ['gluten', 'egg', 'milk'],
    diet: 'vegetarian',
  },
  {
    name: 'Túrókrémes kifli',
    kcal: 380,
    price: 890,
    ingredients: 'kifli (búzaliszt), túró, tejföl, kapor',
    allergens: ['gluten', 'milk'],
    diet: 'vegetarian',
  },
];

const colds: Entry[] = [
  {
    name: 'Franciasaláta',
    kcal: 360,
    price: 1190,
    ingredients: 'burgonya, sárgarépa, zöldborsó, csemegeuborka, majonéz (tojás, mustár)',
    allergens: ['egg', 'mustard'],
    diet: 'vegetarian',
  },
  {
    name: 'Tonhalas tésztasaláta',
    kcal: 420,
    price: 1390,
    ingredients: 'tészta (durumbúzadara), tonhal, kukorica, majonéz (tojás, mustár)',
    allergens: ['gluten', 'egg', 'fish', 'mustard'],
  },
  {
    name: 'Görög saláta',
    kcal: 260,
    price: 1290,
    ingredients: 'paradicsom, uborka, lilahagyma, feta sajt, olívabogyó',
    allergens: ['milk'],
    diet: 'vegetarian',
  },
];

const pickles: Entry[] = [
  {
    name: 'Csemegeuborka',
    kcal: 40,
    price: 390,
    ingredients: 'uborka, ecet, cukor, kapor, mustármag, kén-dioxid',
    allergens: ['mustard', 'sulfites'],
    diet: 'vegan',
  },
  {
    name: 'Káposztasaláta',
    kcal: 70,
    price: 390,
    ingredients: 'fejes káposzta, ecet, cukor, só, kén-dioxid',
    allergens: ['sulfites'],
    diet: 'vegan',
  },
  {
    name: 'Ecetes paprika',
    kcal: 35,
    price: 390,
    ingredients: 'paprika, ecet, cukor, só, kén-dioxid',
    allergens: ['sulfites'],
    diet: 'vegan',
  },
];

const breads: Entry[] = [
  {
    name: 'Teljes kiőrlésű cipó',
    kcal: 270,
    price: 490,
    ingredients: 'teljes kiőrlésű búzaliszt, rozsliszt, élesztő, só',
    allergens: ['gluten'],
    diet: 'vegan',
  },
  {
    name: 'Burgonyás cipó',
    kcal: 310,
    price: 490,
    ingredients: 'búzaliszt, burgonyapehely, tej, élesztő',
    allergens: ['gluten', 'milk'],
    diet: 'vegetarian',
  },
];

const drinks: Entry[] = [
  { name: 'Házi limonádé', kcal: 120, price: 690, ingredients: 'víz, citrom, cukor, menta', allergens: [], diet: 'vegan' },
  { name: 'Szénsavmentes ásványvíz', kcal: 0, price: 290, ingredients: 'természetes ásványvíz', allergens: [], diet: 'vegan' },
  { name: 'Narancslé', kcal: 140, price: 590, ingredients: 'narancslé', allergens: [], diet: 'vegan' },
];

/** Single dishes for custom days: their course, the code that marks them on every day, and how many each day offers. */
const singles: { course: CustomCourse; kind: DishKind; codePrefix: string; category: string; pool: Entry[]; count: number }[] = [
  { course: 'breakfast', kind: 'main', codePrefix: 'R', category: 'Reggeli', pool: breakfasts, count: 2 },
  { course: 'soup', kind: 'soup', codePrefix: 'L', category: 'Levesek', pool: soups, count: 4 },
  { course: 'main', kind: 'main', codePrefix: 'F', category: 'Főételek', pool: mains, count: 6 },
  { course: 'soup', kind: 'soup', codePrefix: 'VL', category: 'Vega & vegán', pool: veganSoups, count: 1 },
  { course: 'main', kind: 'main', codePrefix: 'VF', category: 'Vega & vegán', pool: veganMains, count: 2 },
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

function singleDish(day: Day, single: (typeof singles)[number], code: string, entry: Entry): Dish {
  const { name, kcal, price } = entry;
  return {
    ...line(day, code, name, price, [entry]),
    kind: single.kind,
    section: single.category,
    groupId: single.category,
    category: single.category,
    menuName: single.category,
    pickerEligible: single.course !== 'drink',
    course: single.course,
    kcal,
    components: [course(entry, courseKinds[single.course])],
  };
}

function fullDayMenu(random: () => number, day: Day, code: string, menuName: string): Dish {
  const breakfast = pick(random, breakfasts);
  const [lunch, dinner] = shuffled(random, mains);
  return setMenu(day, code, menuName, [breakfast, pick(random, soups), lunch!, dinner!], ['side', 'soup', 'main', 'main']);
}

/** A set menu whose name lists its courses, separated by slashes as Teletál writes them. */
function setMenu(day: Day, code: string, menuName: string, courses: Entry[], kinds: CourseKind[] = ['soup', 'main']): Dish {
  const name = courses.map(entry => entry.name).join(' / ');
  // A set costs less than its dishes bought one by one.
  const price = Math.round((courses.reduce((sum, entry) => sum + entry.price, 0) * 0.85) / 100) * 100 - 10;
  return {
    ...line(day, code, name, price, courses),
    kind: 'menu',
    section: 'Menük',
    groupId: 'Menük',
    category: 'Menük',
    menuName,
    pickerEligible: true,
    course: null,
    kcal: courses.reduce((sum, entry) => sum + entry.kcal, 0),
    components: courses.map((entry, index) => course(entry, kinds[index])),
  };
}

function course({ name, kcal, ingredients, allergens }: Entry, kind: CourseKind | undefined): Course {
  return { name, kcal, kind, photo: null, allergens: inAllergenOrder(allergens), ingredients };
}

/** The fields every line shares. A line's diet is the least strict diet of its courses, and it is spicy if one of them is. */
function line(day: Day, code: string, name: string, price: number, courses: Entry[]) {
  const diet: Diet | null = courses.every(entry => entry.diet === 'vegan')
    ? 'vegan'
    : courses.every(entry => entry.diet)
      ? 'vegetarian'
      : null;
  const spicy = courses.some(entry => entry.spicy);
  return {
    id: `${day}:1:${code}`,
    day,
    type: 1,
    code,
    name,
    price,
    cuisine: null,
    weekend: false,
    note: null,
    photo: null,
    diet,
    spicy,
  };
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
