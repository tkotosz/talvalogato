import { dishIssue } from './filters.ts';
import { calorieLimit } from './planning.ts';
import type { CustomCourse, CustomDraft, Dish, Generator, Preferences } from './types.ts';

/**
 * The order courses are filled in. The main course comes first because it varies most in calories; the courses after it
 * get what the calorie limit leaves.
 */
const fillOrder: CustomCourse[] = ['main', 'breakfast', 'soup', 'cold', 'dessert', 'bread', 'pickle', 'drink'];

export function startGenerator(seed: number): Generator {
  return { seed: seed >>> 0, shown: {} };
}

/** The next number of a seeded sequence (mulberry32): a float in [0, 1) and the seed that continues the sequence. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296, seed: next };
}

/** The dishes each course may use: the settings' filters apply, and with a calorie limit only dishes with known calories. */
function coursePools(candidates: Dish[], courses: CustomCourse[], preferences: Preferences): Map<CustomCourse, Dish[]> {
  const pools = new Map<CustomCourse, Dish[]>();
  for (const course of fillOrder) {
    if (!courses.includes(course)) continue;
    const pool = candidates.filter(
      dish =>
        dish.course === course && !dishIssue(dish, preferences) && (!preferences.limitCalories || Number.isFinite(dish.kcal)),
    );
    if (pool.length) pools.set(course, pool);
  }
  return pools;
}

const lowestCalories = (pool: Dish[]) => Math.min(...pool.map(dish => dish.kcal ?? 0));

/** Why no menu can be generated: nothing to choose from, or even the lightest dishes go over the calorie limit. */
export type GenerationProblem = 'empty' | 'limit';

export function generationProblem(
  candidates: Dish[],
  courses: CustomCourse[],
  preferences: Preferences,
): GenerationProblem | null {
  const pools = coursePools(candidates, courses, preferences);
  if (!pools.size) return 'empty';
  if (!preferences.limitCalories) return null;
  const lightest = [...pools.values()].reduce((sum, pool) => sum + lowestCalories(pool), 0);
  return lightest > calorieLimit(preferences) ? 'limit' : null;
}

/**
 * A menu with one dish for each chosen course that has dishes today. Among the dishes that fit, it takes one of those
 * shown least so far, so a rejected menu is followed by different dishes. With a calorie limit each course keeps room for
 * the lightest dishes of the courses still to fill, so the menu always fits when any menu can. Returns no dishes when
 * `generationProblem` reports a problem.
 */
export function generateMenu(
  candidates: Dish[],
  courses: CustomCourse[],
  preferences: Preferences,
  generator: Generator,
): { picks: CustomDraft['picks']; generator: Generator } {
  if (generationProblem(candidates, courses, preferences)) return { picks: {}, generator };
  const pools = [...coursePools(candidates, courses, preferences)];
  const limit = preferences.limitCalories ? calorieLimit(preferences) : null;
  const picks: CustomDraft['picks'] = {};
  const shown = { ...generator.shown };
  let seed = generator.seed;
  let used = 0;

  pools.forEach(([course, pool], index) => {
    const reserved = pools.slice(index + 1).reduce((sum, [, later]) => sum + lowestCalories(later), 0);
    const fitting = limit === null ? pool : pool.filter(dish => used + dish.kcal! + reserved <= limit);
    const fewest = Math.min(...fitting.map(dish => shown[dish.id] ?? 0));
    const freshest = fitting.filter(dish => (shown[dish.id] ?? 0) === fewest);
    const random = nextRandom(seed);
    seed = random.seed;
    const dish = freshest[Math.floor(random.value * freshest.length)]!;
    picks[course] = dish;
    shown[dish.id] = fewest + 1;
    used += dish.kcal ?? 0;
  });
  return { picks, generator: { seed, shown } };
}
