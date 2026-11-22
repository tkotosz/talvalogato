import { dishIssue } from './filters.ts';
import { fitsRow } from './custom.ts';
import { calorieLimit, menuDeck } from './planning.ts';
import type { Dish, Generator, Preferences, TrayCourse } from './types.ts';

/**
 * The order rows are filled in: set menus first, as the largest items, then the main course, which varies most in
 * calories; the rows after them get what the calorie limit leaves.
 */
const fillOrder: TrayCourse[] = ['menu', 'main', 'breakfast', 'soup', 'cold', 'dessert', 'bread', 'pickle', 'drink'];

export function startGenerator(seed: number, rows: number[] = []): Generator {
  return { seed: seed >>> 0, shown: {}, rows };
}

/** The next number of a seeded sequence (mulberry32): a float in [0, 1) and the seed that continues the sequence. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296, seed: next };
}

/**
 * The dishes a row may use: the settings' filters apply, and with a calorie limit only dishes with known calories. A
 * set-menu row takes a lunch menu, and a full-day menu only on a day without any, since an idea is one meal's worth.
 */
function rowPool(candidates: Dish[], course: TrayCourse, preferences: Preferences): Dish[] {
  const pool = candidates.filter(
    dish => fitsRow(dish, course) && !dishIssue(dish, preferences) && (!preferences.limitCalories || Number.isFinite(dish.kcal)),
  );
  if (course !== 'menu') return pool;
  const lunch = pool.filter(dish => menuDeck(dish) === 'lunch');
  return lunch.length ? lunch : pool;
}

/** What an idea fills, in the order it fills it: the rows of `courses` in fill order, each with the dishes it may use. */
function fillPlan(candidates: Dish[], courses: TrayCourse[], preferences: Preferences): { row: number; pool: Dish[] }[] {
  return courses
    .map((course, row) => ({ course, row }))
    .sort((a, b) => fillOrder.indexOf(a.course) - fillOrder.indexOf(b.course))
    .map(({ course, row }) => ({ row, pool: rowPool(candidates, course, preferences) }))
    .filter(({ pool }) => pool.length > 0);
}

const lowestCalories = (pool: Dish[]) => Math.min(...pool.map(dish => dish.kcal ?? 0));

/** Why no menu can be generated: nothing to choose from, or even the lightest dishes go over the calorie limit. */
export type GenerationProblem = 'empty' | 'limit';

/** Whether an idea can fill rows of `courses`. `used` is the calories already on the day's tray, which it must fit next to. */
export function generationProblem(
  candidates: Dish[],
  courses: TrayCourse[],
  preferences: Preferences,
  used = 0,
): GenerationProblem | null {
  const plan = fillPlan(candidates, courses, preferences);
  if (!plan.length) return 'empty';
  if (!preferences.limitCalories) return null;
  const lightest = plan.reduce((sum, { pool }) => sum + lowestCalories(pool), 0);
  return used + lightest > calorieLimit(preferences) ? 'limit' : null;
}

/**
 * A dish for each row of `courses` that has dishes today, by position.
 * Among the dishes that fit, it takes one of those shown least so far, so a rejected idea is followed by different dishes
 * and two rows of the same course get different dishes while there are any. With a calorie limit each row keeps room for
 * the lightest dishes of the rows still to fill, so the idea always fits when any can, next to the `used` calories already
 * on the tray. Fills nothing when `generationProblem` reports a problem.
 */
export function generateMenu(
  candidates: Dish[],
  courses: TrayCourse[],
  preferences: Preferences,
  generator: Generator,
  used = 0,
): { dishes: (Dish | undefined)[]; generator: Generator } {
  const dishes: (Dish | undefined)[] = courses.map(() => undefined);
  if (generationProblem(candidates, courses, preferences, used)) return { dishes, generator };
  const plan = fillPlan(candidates, courses, preferences);
  const limit = preferences.limitCalories ? calorieLimit(preferences) : null;
  const shown = { ...generator.shown };
  let seed = generator.seed;
  let total = used;

  plan.forEach(({ row, pool }, index) => {
    const reserved = plan.slice(index + 1).reduce((sum, later) => sum + lowestCalories(later.pool), 0);
    const fitting = limit === null ? pool : pool.filter(dish => total + dish.kcal! + reserved <= limit);
    const fewest = Math.min(...fitting.map(dish => shown[dish.id] ?? 0));
    const freshest = fitting.filter(dish => (shown[dish.id] ?? 0) === fewest);
    const random = nextRandom(seed);
    seed = random.seed;
    const dish = freshest[Math.floor(random.value * freshest.length)]!;
    dishes[row] = dish;
    shown[dish.id] = fewest + 1;
    total += dish.kcal ?? 0;
  });
  return { dishes, generator: { ...generator, seed, shown } };
}
