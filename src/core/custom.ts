import { mealCourses, sideCourses } from './courses.ts';
import { calorieLimit } from './planning.ts';
import type { CustomChoice, CustomCourse, CustomDraft, CustomStage, Dish, MenuOption, Preferences } from './types.ts';

const allCourses = [...mealCourses, ...sideCourses];

export function startCustom(preferences: Preferences): CustomDraft {
  const courses = preferences.mealCourses;
  return { mealCourses: courses, sideCourses: null, stage: 'meals', picks: {}, overLimit: [], editing: false };
}

/** The courses of the day in the order they are swiped; side courses join once they are chosen. */
export function chosenCourses(draft: Pick<CustomDraft, 'mealCourses' | 'sideCourses'>): CustomCourse[] {
  return [...draft.mealCourses, ...(draft.sideCourses ?? [])];
}

/** The dishes picked for the chosen courses, in eating order. */
export function pickedDishes(draft: Pick<CustomDraft, 'mealCourses' | 'sideCourses' | 'picks'>): Dish[] {
  return chosenCourses(draft)
    .map(course => draft.picks[course])
    .filter(dish => dish !== undefined && dish !== null);
}

/** Calories of the picked dishes, or null when any of them has no calorie data. */
export function totalCalories(dishes: Dish[]): number | null {
  let total = 0;
  for (const dish of dishes) {
    if (!Number.isFinite(dish.kcal)) return null;
    total += dish.kcal!;
  }
  return Math.round(total * 10) / 10;
}

/** What is left of the day's calorie limit for `course`, after the dishes picked for the other courses; null without a limit. */
export function remainingCalories(draft: CustomDraft, preferences: Preferences, course: CustomCourse): number | null {
  if (!preferences.limitCalories) return null;
  const others = pickedDishes({ ...draft, picks: { ...draft.picks, [course]: undefined } });
  return Math.round((calorieLimit(preferences) - (totalCalories(others) ?? 0)) * 10) / 10;
}

export function dishOption(dish: Dish): MenuOption {
  return {
    id: dish.id,
    kind: 'menu',
    dishes: [dish],
    kcal: dish.kcal ?? null,
    price: dish.price,
    title: dish.name,
    photo: dish.photo,
    components: dish.components,
  };
}

export interface CourseDeck {
  /** Cards in Teletál's order, dishes that fit the remaining limit first. */
  options: MenuOption[];
  /** Calories left for this course under the limit, or null without a limit. */
  remaining: number | null;
  /** Dishes of the course that exceed the remaining limit; the user can choose to see them. */
  overLimitCount: number;
}

/**
 * The cards for one course. Code exclusions apply as in the set-menu decks. With a calorie limit only dishes with known
 * calories are offered, and those over the remaining limit only after the user asks for them.
 */
export function courseDeck(dishes: Dish[], course: CustomCourse, draft: CustomDraft, preferences: Preferences): CourseDeck {
  const excluded = new Set(preferences.filterCodes ? preferences.excludedCodes : []);
  const candidates = dishes.filter(dish => dish.course === course && !excluded.has(dish.code));
  const remaining = remainingCalories(draft, preferences, course);
  if (remaining === null) return { options: candidates.map(dishOption), remaining, overLimitCount: 0 };

  const known = candidates.filter(dish => Number.isFinite(dish.kcal));
  const fitting = known.filter(dish => dish.kcal! <= remaining);
  const over = known.filter(dish => dish.kcal! > remaining);
  const shown = draft.overLimit.includes(course) ? [...fitting, ...over] : fitting;
  return { options: shown.map(dishOption), remaining, overLimitCount: over.length };
}

/** The stage after deciding `course`, or null when the day is complete. */
export function nextStage(draft: CustomDraft, course: CustomCourse): CustomStage | null {
  if (draft.editing) return 'summary';
  const order = chosenCourses(draft);
  const next = order[order.indexOf(course) + 1];
  if (next) return next;
  if (mealCourses.includes(course) && draft.sideCourses === null) return 'sides';
  return null;
}

/** The first stage after the meal checklist. */
export function firstMealStage(draft: CustomDraft): CustomStage {
  return draft.mealCourses[0] ?? (draft.sideCourses === null ? 'sides' : (draft.sideCourses[0] ?? 'sides'));
}

/** The saved day: a custom option, or null when no course got a dish. */
export function customOption(draft: CustomDraft, preferences: Preferences): MenuOption | null {
  const dishes = pickedDishes(draft);
  if (!dishes.length) return null;
  const kcal = totalCalories(dishes);
  const custom: CustomChoice = {
    mealCourses: draft.mealCourses,
    sideCourses: draft.sideCourses ?? [],
    overLimit: preferences.limitCalories && kcal !== null && kcal > calorieLimit(preferences),
  };
  return {
    id: dishes.map(dish => dish.id).join('+'),
    kind: 'custom',
    dishes,
    kcal,
    price: dishes.reduce((sum, dish) => sum + dish.price, 0),
    title: 'Saját menü',
    photo: dishes.find(dish => dish.photo)?.photo ?? null,
    custom,
  };
}

/** A draft that edits a saved custom day, opened on its summary. */
export function editCustom(option: MenuOption): CustomDraft {
  const choice = option.custom ?? { mealCourses: [], sideCourses: [], overLimit: false };
  const picks: CustomDraft['picks'] = {};
  for (const course of [...choice.mealCourses, ...choice.sideCourses]) picks[course] = null;
  for (const dish of option.dishes) if (dish.course) picks[dish.course] = dish;
  return {
    mealCourses: choice.mealCourses,
    sideCourses: choice.sideCourses,
    stage: 'summary',
    picks,
    overLimit: choice.overLimit ? [...allCourses] : [],
    editing: true,
  };
}
