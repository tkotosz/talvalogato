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

/** Calories and price added up, as far as a limit asks about them; the other is left at zero. */
interface Totals {
  kcal: number;
  price: number;
}

/** Which totals a limit asks about. */
interface Measured {
  kcal: boolean;
  price: boolean;
}

/**
 * The lowest totals one dish from each pool can add up to: every pairing of calories and price that no other choice of
 * dishes beats in both. A limit on both can be met exactly when one of these pairings meets it, which the lightest
 * dishes and the cheapest dishes on their own cannot tell, as they may be different dishes.
 */
function lowestTotals(pools: Dish[][], measured: Measured): Totals[] {
  let lowest: Totals[] = [{ kcal: 0, price: 0 }];
  for (const pool of pools) {
    const sums = lowest.flatMap(sum =>
      pool.map(dish => ({
        kcal: sum.kcal + (measured.kcal ? (dish.kcal ?? 0) : 0),
        price: sum.price + (measured.price ? dish.price : 0),
      })),
    );
    // Sorted by calories, a pairing is kept only when it is cheaper than every lighter one.
    sums.sort((a, b) => a.kcal - b.kcal || a.price - b.price);
    lowest = [];
    for (const sum of sums) if (!lowest.length || sum.price < lowest.at(-1)!.price) lowest.push(sum);
  }
  return lowest;
}

/** Why no menu can be generated: nothing to choose from, or even the lightest or cheapest dishes go over a limit. */
export type GenerationProblem = 'empty' | 'calories' | 'money';

/** What an idea has room for: calories under the daily limit and forints under the weekly one, null for no limit. */
interface Room {
  kcal: number | null;
  money: number | null;
}

function roomFor(preferences: Preferences, used: number, money: number | null): Room {
  return { kcal: preferences.limitCalories ? calorieLimit(preferences) - used : null, money };
}

const fitsRoom = (totals: Totals, room: Room) =>
  (room.kcal === null || totals.kcal <= room.kcal) && (room.money === null || totals.price <= room.money);

const measuredBy = (room: Room): Measured => ({ kcal: room.kcal !== null, price: room.money !== null });

/**
 * Whether an idea can fill rows of `courses`. `used` is the calories already on the day's tray, which it must fit next
 * to; `money` is the forints the weekly spending limit leaves for the rows it fills, or null without a limit.
 */
export function generationProblem(
  candidates: Dish[],
  courses: TrayCourse[],
  preferences: Preferences,
  used = 0,
  money: number | null = null,
): GenerationProblem | null {
  const plan = fillPlan(candidates, courses, preferences);
  if (!plan.length) return 'empty';
  const room = roomFor(preferences, used, money);
  const lowest = lowestTotals(
    plan.map(({ pool }) => pool),
    measuredBy(room),
  );
  if (lowest.some(totals => fitsRoom(totals, room))) return null;
  // The calories stand in the way when they alone leave no room; otherwise the money does.
  return room.kcal !== null && !lowest.some(totals => totals.kcal <= room.kcal!) ? 'calories' : 'money';
}

/**
 * A dish for each row of `courses` that has dishes today, by position.
 * Among the dishes that fit, it takes one of those shown least so far, so a rejected idea is followed by different dishes
 * and two rows of the same course get different dishes while there are any. With a calorie limit or a spending limit
 * each row keeps room for the rows still to fill, so the idea always fits when any can, next to the `used` calories
 * already on the tray and within `money`, the forints left for these rows. Fills nothing when `generationProblem`
 * reports a problem.
 */
export function generateMenu(
  candidates: Dish[],
  courses: TrayCourse[],
  preferences: Preferences,
  generator: Generator,
  used = 0,
  money: number | null = null,
): { dishes: (Dish | undefined)[]; generator: Generator } {
  const dishes: (Dish | undefined)[] = courses.map(() => undefined);
  if (generationProblem(candidates, courses, preferences, used, money)) return { dishes, generator };
  const plan = fillPlan(candidates, courses, preferences);
  const room = roomFor(preferences, used, money);
  const measured = measuredBy(room);
  const shown = { ...generator.shown };
  let seed = generator.seed;
  let total: Totals = { kcal: 0, price: 0 };

  plan.forEach(({ row, pool }, index) => {
    const rest = lowestTotals(
      plan.slice(index + 1).map(later => later.pool),
      measured,
    );
    const fitting = pool.filter(dish =>
      rest.some(later =>
        fitsRoom({ kcal: total.kcal + (dish.kcal ?? 0) + later.kcal, price: total.price + dish.price + later.price }, room),
      ),
    );
    const fewest = Math.min(...fitting.map(dish => shown[dish.id] ?? 0));
    const freshest = fitting.filter(dish => (shown[dish.id] ?? 0) === fewest);
    const random = nextRandom(seed);
    seed = random.seed;
    const dish = freshest[Math.floor(random.value * freshest.length)]!;
    dishes[row] = dish;
    shown[dish.id] = fewest + 1;
    total = { kcal: total.kcal + (dish.kcal ?? 0), price: total.price + dish.price };
  });
  return { dishes, generator: { ...generator, seed, shown } };
}
