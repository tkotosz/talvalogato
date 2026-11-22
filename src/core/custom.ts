import { allCourses, normalizeCourses } from './courses.ts';
import { dishIssue } from './filters.ts';
import { calorieLimit } from './planning.ts';
import type { CustomChoice, CustomCourse, CustomDraft, Dish, MenuOption, Preferences } from './types.ts';

export function startCustom(preferences: Preferences): CustomDraft {
  return { courses: preferences.customCourses, stage: 'select', picks: {}, overLimit: [] };
}

/** The draft with a new component selection; dishes of components no longer chosen are dropped. */
export function withCourses(draft: CustomDraft, selection: CustomCourse[]): CustomDraft {
  const courses = normalizeCourses(selection);
  const picks: CustomDraft['picks'] = {};
  for (const course of courses) if (draft.picks[course]) picks[course] = draft.picks[course];
  return { ...draft, courses, picks, overLimit: draft.overLimit.filter(course => courses.includes(course)), stage: 'overview' };
}

/** The picked dishes in menu order. */
export function pickedDishes(draft: Pick<CustomDraft, 'courses' | 'picks'>): Dish[] {
  return draft.courses.map(course => draft.picks[course]).filter(dish => dish !== undefined);
}

/** Calories of the dishes, or null when any of them has no calorie data. */
export function totalCalories(dishes: Dish[]): number | null {
  let total = 0;
  for (const dish of dishes) {
    if (!Number.isFinite(dish.kcal)) return null;
    total += dish.kcal!;
  }
  return Math.round(total * 10) / 10;
}

/** What is left of the day's calorie limit for `course`, after the dishes of the other components; null without a limit. */
export function remainingCalories(draft: CustomDraft, preferences: Preferences, course: CustomCourse): number | null {
  if (!preferences.limitCalories) return null;
  const others = pickedDishes({ courses: draft.courses.filter(other => other !== course), picks: draft.picks });
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
  /** Cards in Teletál's order, dishes that fit the remaining limit first, then any shown beyond it by calories. */
  options: MenuOption[];
  /** Calories left for this component under the limit, or null without a limit. */
  remaining: number | null;
  /** Dishes of the component that exceed the remaining limit; the user can choose to see them. */
  overLimitCount: number;
}

/**
 * The cards for one component. The settings' filters apply as in the set-menu decks. With a calorie limit only dishes with
 * known calories are offered, and those over the remaining limit only after the user asks for them.
 */
export function courseDeck(dishes: Dish[], course: CustomCourse, draft: CustomDraft, preferences: Preferences): CourseDeck {
  const candidates = dishes.filter(dish => dish.course === course && !dishIssue(dish, preferences));
  const remaining = remainingCalories(draft, preferences, course);
  if (remaining === null) return { options: candidates.map(dishOption), remaining, overLimitCount: 0 };

  const known = candidates.filter(dish => Number.isFinite(dish.kcal));
  const fitting = known.filter(dish => dish.kcal! <= remaining);
  // Going over the limit, the smallest overshoot comes first.
  const over = known.filter(dish => dish.kcal! > remaining).sort((a, b) => a.kcal! - b.kcal!);
  const shown = draft.overLimit.includes(course) ? [...fitting, ...over] : fitting;
  return { options: shown.map(dishOption), remaining, overLimitCount: over.length };
}

/** The saved day, or null while no component has a dish. */
export function customOption(draft: CustomDraft, preferences: Preferences): MenuOption | null {
  const dishes = pickedDishes(draft);
  if (!dishes.length) return null;
  const kcal = totalCalories(dishes);
  const custom: CustomChoice = {
    courses: draft.courses,
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

/** A draft that edits a saved custom day, opened on its overview. */
export function editCustom(option: MenuOption): CustomDraft {
  const picks: CustomDraft['picks'] = {};
  for (const dish of option.dishes) if (dish.course) picks[dish.course] = dish;
  const courses = normalizeCourses([...(option.custom?.courses ?? []), ...Object.keys(picks)]);
  return { courses, stage: 'overview', picks, overLimit: option.custom?.overLimit ? [...allCourses] : [] };
}
