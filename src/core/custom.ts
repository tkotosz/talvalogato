import { allCourses, courseNames } from './courses.ts';
import { dishIssue } from './filters.ts';
import { calorieLimit, menuDeck } from './planning.ts';
import type { CustomChoice, CustomDraft, Dish, MenuOption, Preferences, TrayCourse, TrayRow } from './types.ts';

/**
 * Every kind of tray row in the order the tray lists them: breakfast first, then Teletál set menus, then the other
 * courses in menu order.
 */
export const trayCourses: TrayCourse[] = ['breakfast', 'menu', ...allCourses.filter(course => course !== 'breakfast')];

/** The names of the tray rows. */
export const trayCourseNames: Record<TrayCourse, string> = { ...courseNames, menu: 'Teletál menü' };

/** An empty tray: no rows yet. A day opens on it. */
export function emptyTray(): CustomDraft {
  return { rows: [], stage: 'overview', overLimit: [] };
}

/** Whether `dish` can fill a row of `course`: a Teletál set menu, lunch or full-day, or a dish of that course. */
export function fitsRow(dish: Dish, course: TrayCourse): boolean {
  return course === 'menu' ? !dish.course && menuDeck(dish) !== null : dish.course === course;
}

/** The rows in tray order; rows of the same kind keep the order they were added in. */
function inTrayOrder(rows: TrayRow[]): TrayRow[] {
  return [...rows].sort((a, b) => trayCourses.indexOf(a.course) - trayCourses.indexOf(b.course));
}

/** The tray with another, empty row for `course`, to fill from its deck or list, or with an idea. */
export function withCourse(draft: CustomDraft, course: TrayCourse): CustomDraft {
  return { ...draft, rows: inTrayOrder([...draft.rows, { course }]), stage: 'overview' };
}

/** The tray with the row at `index` emptied: the row stays for another dish or an idea. */
export function withoutDish(draft: CustomDraft, index: number): CustomDraft {
  const rows = draft.rows.map((row, at) => (at === index ? { course: row.course } : row));
  return { ...draft, rows, stage: 'overview' };
}

/** The tray without the row at `index`. */
export function withoutRow(draft: CustomDraft, index: number): CustomDraft {
  return { ...draft, rows: draft.rows.filter((_, at) => at !== index), stage: 'overview' };
}

/** The tray with `dish` on the row at `index`. */
export function withPick(draft: CustomDraft, index: number, dish: Dish): CustomDraft {
  const rows = draft.rows.map((row, at) => (at === index ? { course: row.course, dish } : row));
  return { ...draft, rows, stage: 'overview' };
}

/** The indexes of the rows on the tray that have no dish yet. */
export function emptyRows(draft: Pick<CustomDraft, 'rows'>): number[] {
  return draft.rows.flatMap((row, index) => (row.dish ? [] : [index]));
}

/** Whether an idea makes sense for the tray: it fills the empty rows, and a tray of one row is a plain pick, not an idea. */
export function canGenerate(draft: Pick<CustomDraft, 'rows'>): boolean {
  return draft.rows.length >= 2 && emptyRows(draft).length > 0;
}

/** The dishes on the tray, in tray order. */
export function pickedDishes(draft: Pick<CustomDraft, 'rows'>): Dish[] {
  return draft.rows.flatMap(row => (row.dish ? [row.dish] : []));
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

/** What is left of the day's calorie limit for the row at `index`, after everything else on the tray; null without a limit. */
export function remainingCalories(draft: CustomDraft, preferences: Preferences, index: number): number | null {
  if (!preferences.limitCalories) return null;
  const others = pickedDishes({ rows: draft.rows.filter((_, at) => at !== index) });
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
  /** Dishes in Teletál's order, those that fit the remaining limit first, then any shown beyond it by calories. */
  options: MenuOption[];
  /** Calories left for this row under the limit, or null without a limit. */
  remaining: number | null;
  /** Dishes for the row that exceed the remaining limit; the user can choose to see them. */
  overLimitCount: number;
}

/**
 * The dishes offered for the row at `index`, as a deck or a list. The settings' filters apply. With a calorie limit only
 * dishes with known calories are offered, set menus closest to the remaining limit first, and those over the remaining
 * limit only after the user asks.
 */
export function courseDeck(dishes: Dish[], draft: CustomDraft, index: number, preferences: Preferences): CourseDeck {
  const course = draft.rows[index]?.course;
  const candidates = course ? dishes.filter(dish => fitsRow(dish, course) && !dishIssue(dish, preferences)) : [];
  const remaining = remainingCalories(draft, preferences, index);
  if (remaining === null) return { options: candidates.map(dishOption), remaining, overLimitCount: 0 };

  const known = candidates.filter(dish => Number.isFinite(dish.kcal));
  const fitting = known.filter(dish => dish.kcal! <= remaining);
  // Set menus are the day's largest items: the one that fills what is left best comes first, the cheaper on a tie.
  if (course === 'menu') fitting.sort((a, b) => remaining - a.kcal! - (remaining - b.kcal!) || a.price - b.price);
  // Going over the limit, the smallest overshoot comes first.
  const over = known.filter(dish => dish.kcal! > remaining).sort((a, b) => a.kcal! - b.kcal!);
  const shown = course && draft.overLimit.includes(course) ? [...fitting, ...over] : fitting;
  return { options: shown.map(dishOption), remaining, overLimitCount: over.length };
}

/**
 * The day the tray saves, or null while it holds no dish. A set menu alone is saved as that menu, like a pick from its
 * deck; anything else is saved as a combined day, with every row's kind, so editing restores the empty rows too.
 */
export function customOption(draft: CustomDraft, preferences: Preferences): MenuOption | null {
  const dishes = pickedDishes(draft);
  if (!dishes.length) return null;
  const menus = dishes.filter(dish => !dish.course);
  if (menus.length === 1 && dishes.length === 1) return dishOption(menus[0]!);
  const kcal = totalCalories(dishes);
  const custom: CustomChoice = {
    courses: draft.rows.map(row => row.course),
    overLimit: preferences.limitCalories && kcal !== null && kcal > calorieLimit(preferences),
  };
  return {
    id: dishes.map(dish => dish.id).join('+'),
    kind: 'custom',
    dishes,
    kcal,
    price: dishes.reduce((sum, dish) => sum + dish.price, 0),
    title: menus.length === 1 ? `${menus[0]!.menuName} kiegészítőkkel` : 'Saját menü',
    photo: dishes.find(dish => dish.photo)?.photo ?? null,
    custom,
  };
}

/**
 * A tray that edits a saved day: a row for each dish, a Teletál set menu on a set-menu row, and empty rows for the kinds
 * saved without a dish.
 */
export function editCustom(option: MenuOption): CustomDraft {
  const rows: TrayRow[] = option.dishes.map(dish => ({ course: dish.course ?? 'menu', dish }));
  // Each saved kind beyond its dishes was an empty row.
  const filled = [...rows];
  for (const course of option.custom?.courses ?? []) {
    const match = filled.findIndex(row => row.course === course);
    if (match >= 0) filled.splice(match, 1);
    else rows.push({ course });
  }
  return { ...emptyTray(), rows: inTrayOrder(rows), overLimit: option.custom?.overLimit ? [...trayCourses] : [] };
}

/** No filter and no calorie limit: what the day offers at all. */
const unfiltered = (preferences: Preferences): Preferences => ({
  ...preferences,
  limitCalories: false,
  filterCodes: false,
  diet: 'all',
  filterAllergens: false,
  filterDislikes: false,
});

/**
 * How many dishes a new row of each kind could offer among `candidates`: `allowed` under the settings, and `available`
 * without their filters and calorie limit, so a kind the settings leave empty can say why.
 */
export function rowChoiceCounts(
  candidates: Dish[],
  preferences: Preferences,
): { allowed: Record<TrayCourse, number>; available: Record<TrayCourse, number> } {
  const count = (settings: Preferences) =>
    Object.fromEntries(
      trayCourses.map(course => [course, courseDeck(candidates, withCourse(emptyTray(), course), 0, settings).options.length]),
    ) as Record<TrayCourse, number>;
  return { allowed: count(preferences), available: count(unfiltered(preferences)) };
}
