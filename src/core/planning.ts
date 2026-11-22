import { allAllergens, inAllergenOrder } from './allergens.ts';
import { defaultCourses, normalizeCourses } from './courses.ts';
import { allDislikes, dishIssue, ownDislikeWord } from './filters.ts';
import { addDays, mondayOfWeek, todayInBudapest } from './weeks.ts';
import type {
  CartLine,
  CatalogDish,
  Day,
  DayDraft,
  Dish,
  DishDetails,
  MenuDeckId,
  MenuOption,
  Plan,
  Preferences,
  WeekKey,
} from './types.ts';

export const days = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
export const allDays: Day[] = days.map((_, index) => index + 1);
export const menuDecks: { id: MenuDeckId; label: string }[] = [
  { id: 'lunch', label: 'Teletál ebédmenü' },
  { id: 'fullDay', label: 'Teletál egész napos menü' },
];
const fullDayCodes = new Set(['Z10', 'Z11', 'IRN']);
const groupNames = new Map([
  ['CzanikBalazs', 'Czanik Balázs'],
  ['KlimaAnita', 'Somogyi Kovács Anita'],
]);
const emptyDraft: DayDraft = { excluded: [], deferred: [] };
export const newPreferences: Preferences = {
  limitCalories: false,
  calories: 2000,
  tolerance: 10,
  filterCodes: false,
  excludedCodes: [],
  defaultDays: allDays,
  customCourses: defaultCourses,
  diet: 'all',
  filterAllergens: false,
  excludedAllergens: [],
  filterDislikes: false,
  dislikes: [],
  ownDislikes: [],
};
export const dishCodePattern = /^[A-Z0-9][A-Z0-9-]{0,15}$/i;
/** The most own dislikes the settings keep. */
export const maxOwnDislikes = 20;

/** Preference values as stored or typed in, before validation. */
export type PreferenceInput = { [Key in keyof Preferences]?: unknown };

/** The swipe actions plus the whole-day decisions. */
export type DeckAction = 'left' | 'up' | 'right' | 'skip' | 'restart';

export function normalizeGroupTitle(title: string, section: string): string {
  if (!title || title !== title.toLocaleUpperCase('hu')) return title;
  const lower = title.toLocaleLowerCase('hu');
  const name = groupNames.get(section);
  if (name && lower.startsWith(`${name.toLocaleLowerCase('hu')} `)) return name + lower.slice(name.length);
  return lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('hu'));
}

export function calorieLimit({ calories, tolerance }: Pick<Preferences, 'calories' | 'tolerance'>): number {
  return Math.floor((calories * (100 + tolerance) + Number.EPSILON) / 10) / 10;
}

export function validCalorieBudget({ calories, tolerance }: PreferenceInput): boolean {
  return (
    typeof calories === 'number' &&
    Number.isInteger(calories) &&
    calories >= 1 &&
    typeof tolerance === 'number' &&
    Number.isFinite(tolerance) &&
    tolerance >= 0 &&
    tolerance <= 100 &&
    Number.isFinite(calorieLimit({ calories, tolerance }))
  );
}

function normalizeDays(selection: unknown): Day[] {
  return Array.isArray(selection) ? allDays.filter(day => selection.includes(day)) : allDays;
}

export function restorePreferences(values: PreferenceInput | null): Preferences {
  if (!values) return newPreferences;
  const validBudget = validCalorieBudget(values);
  const excludedCodes = Array.isArray(values.excludedCodes)
    ? [
        ...new Set(
          values.excludedCodes
            .filter((code): code is string => typeof code === 'string' && dishCodePattern.test(code))
            .map(code => code.toUpperCase()),
        ),
      ]
    : [];
  return {
    limitCalories: validBudget && values.limitCalories === true,
    calories: validBudget ? (values.calories as number) : newPreferences.calories,
    tolerance: validBudget ? (values.tolerance as number) : newPreferences.tolerance,
    filterCodes: values.filterCodes === true,
    excludedCodes,
    defaultDays: normalizeDays(values.defaultDays),
    customCourses: Array.isArray(values.customCourses) ? normalizeCourses(values.customCourses) : defaultCourses,
    diet: values.diet === 'vegetarian' || values.diet === 'vegan' ? values.diet : 'all',
    filterAllergens: values.filterAllergens === true,
    excludedAllergens: Array.isArray(values.excludedAllergens)
      ? inAllergenOrder(allAllergens.filter(allergen => (values.excludedAllergens as unknown[]).includes(allergen)))
      : [],
    filterDislikes: values.filterDislikes === true,
    dislikes: Array.isArray(values.dislikes)
      ? allDislikes.filter(dislike => (values.dislikes as unknown[]).includes(dislike))
      : [],
    ownDislikes: Array.isArray(values.ownDislikes)
      ? [
          ...new Set(
            values.ownDislikes
              .map(word => (typeof word === 'string' ? ownDislikeWord(word) : null))
              .filter(word => word !== null),
          ),
        ].slice(0, maxOwnDislikes)
      : [],
  };
}

export function startPlan(week: WeekKey, day: Day | null, selectedDays: Day[] = allDays): Plan {
  return { id: crypto.randomUUID(), week, day, selectedDays: normalizeDays(selectedDays), slots: {}, drafts: {}, custom: {} };
}

/** A plan as read back from storage, before validation. */
export interface StoredPlan extends Partial<Omit<Plan, 'day'>> {
  id: string;
  week: WeekKey;
  day?: unknown;
}

export function restorePlan({ id, week, day, selectedDays, slots, drafts, custom }: StoredPlan): Plan {
  const activeDay = typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= days.length ? day : null;
  return {
    id,
    week,
    day: activeDay,
    selectedDays: normalizeDays(selectedDays),
    slots: slots ?? {},
    drafts: drafts ?? {},
    custom: custom ?? {},
  };
}

/**
 * The saved plans, one per week, without the weeks that have already ended. Unreadable entries are left out, and a single
 * plan saved before plans were kept per week becomes its week's plan.
 */
export function restorePlans(stored: unknown, previous: unknown, now = new Date()): Record<WeekKey, Plan> {
  const today = todayInBudapest(now);
  const entries = stored && typeof stored === 'object' ? Object.values(stored) : previous ? [previous] : [];
  const plans: Record<WeekKey, Plan> = {};
  for (const entry of entries as Partial<StoredPlan>[]) {
    const monday = entry?.id && entry.week ? mondayOfWeek(entry.week) : null;
    if (monday && addDays(monday, 6) >= today) plans[entry.week!] = restorePlan(entry as StoredPlan);
  }
  return plans;
}

// Teletál delivers weekend meals on Friday. A weekend day offers the lines Teletál publishes for that day,
// plus Friday's lines for codes without a separate weekend line, such as the lunch sets.
export function dayCandidates<T extends CatalogDish>(catalog: T[], day: Day): T[] {
  const ownCodes = new Set(catalog.filter(dish => dish.day === day).map(dish => dish.code));
  return catalog.filter(dish => dish.day === day || (day > 5 && dish.day === 5 && !ownCodes.has(dish.code)));
}

/**
 * Splits a Teletál dish name such as "Mikulás puttonya (diós, töltött csirkemell), jázmin rizs" into a title without the
 * parenthesized parts, "Mikulás puttonya, jázmin rizs", and those parts as a description. A name without parentheses, or
 * made only of them, stays whole.
 */
export function splitDishName(name: string): { title: string; description: string | null } {
  let title = '';
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const char of name) {
    if (char === '(') {
      if (depth > 0) part += char;
      depth += 1;
    } else if (char === ')' && depth > 0) {
      depth -= 1;
      if (depth > 0) part += char;
      else {
        parts.push(part.trim());
        part = '';
      }
    } else if (depth > 0) part += char;
    else title += char;
  }
  title = title
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const description = parts.filter(Boolean).join(' · ');
  if (depth > 0 || !title || !description) return { title: name, description: null };
  return { title, description };
}

/**
 * A catalog line with its details from Teletál's dish page. Teletál's menu page names dishes briefly, its dish page at
 * length; the brief names are kept: the dish keeps its catalog name, and its courses take the parts of that name when
 * they match the courses one to one. Calories and photos come from the details.
 */
export function withDetails(dish: CatalogDish & Partial<Dish>, details: DishDetails | undefined): Dish {
  if (!details || !Number.isFinite(details.kcal)) return { ...dish, kcal: null };
  const components = details.components ?? [];
  const parts = dish.name.split(' / ');
  const named = parts.length === components.length;
  return {
    ...dish,
    ...details,
    kind: components.length > 1 ? 'menu' : dish.kind,
    name: dish.name,
    components: named ? components.map((course, index) => ({ ...course, name: parts[index]! })) : components,
  };
}

export function menuDeck(dish: CatalogDish & Partial<Dish>): MenuDeckId | null {
  if (fullDayCodes.has(dish.code)) return 'fullDay';
  if (dish.code === 'IR') return 'lunch';
  if (dish.kind !== 'menu' || dish.pickerEligible === false) return null;
  if (!dish.components?.length) return 'lunch';
  const kinds = new Set(dish.components.map(course => course.kind));
  return kinds.has('soup') && kinds.has('main') ? 'lunch' : null;
}

export function matchesCalorieLimit(kcal: number | null, preferences: Preferences): boolean {
  return !preferences.limitCalories || (Number.isFinite(kcal) && kcal! >= 0 && kcal! <= calorieLimit(preferences));
}

export function mealOptions(dishes: Dish[], preferences: Preferences, deck: MenuDeckId): MenuOption[] {
  const options: MenuOption[] = dishes
    .filter(dish => menuDeck(dish) === deck && !dishIssue(dish, preferences) && matchesCalorieLimit(dish.kcal, preferences))
    .map(dish => ({
      id: dish.id,
      kind: 'menu',
      dishes: [dish],
      kcal: dish.kcal ?? null,
      price: dish.price,
      title: dish.name,
      photo: dish.photo,
      components: dish.components,
    }));
  if (preferences.limitCalories)
    options.sort(
      (a, b) => Math.abs(a.kcal! - preferences.calories) - Math.abs(b.kcal! - preferences.calories) || a.price - b.price,
    );
  return options;
}

export function selectionIssue(
  option: MenuOption,
  day: Day,
  eligible: Day[],
  catalog: Dish[],
  preferences: Preferences,
): string | null {
  const candidates = dayCandidates(catalog, day);
  // Each picked dish as the current menu data has it, so a correction made after the pick counts.
  const current = option.dishes.map(dish => candidates.find(item => item.day === dish.day && item.code === dish.code));
  if (!eligible.includes(day) || current.some(dish => !dish)) return 'Már nem rendelhető';
  const issue = current.map(dish => dishIssue(dish!, preferences)).find(Boolean);
  if (issue) return issue;
  // A custom day the user chose to take over the limit still goes to the cart.
  if (!matchesCalorieLimit(option.kcal, preferences) && !option.custom?.overLimit)
    return Number.isFinite(option.kcal) ? 'Kalóriakereten felül' : 'Nincs kalóriaadat';
  return null;
}

export function dayQueue(options: MenuOption[], plan: Plan): MenuOption[] {
  const draft = (plan.day && plan.drafts[plan.day]) || emptyDraft;
  const excluded = new Set(draft.excluded);
  const deferred = new Set(draft.deferred);
  const available = options.filter(option => !excluded.has(option.id));
  const availableById = new Map(available.map(option => [option.id, option]));
  return [
    ...available.filter(option => !deferred.has(option.id)),
    ...draft.deferred.map(id => availableById.get(id)).filter(option => option !== undefined),
  ];
}

/** Applies a deck decision to the plan's current day. `option` is the card on top, absent for whole-day actions. */
export function choose(plan: Plan, action: DeckAction, option: MenuOption | null | undefined, eligible: Day[]): Plan {
  const { day } = plan;
  if (day === null) return plan;
  const drafts = { ...plan.drafts };
  if (action === 'restart') {
    delete drafts[day];
    return { ...plan, drafts };
  }
  if (action === 'skip' || action === 'right') {
    const slots = { ...plan.slots, [day]: action === 'skip' ? null : (option ?? null) };
    delete drafts[day];
    const pending = eligible.filter(candidate => !Object.hasOwn(slots, candidate));
    const next = pending.find(candidate => candidate > day) ?? pending[0] ?? null;
    return { ...plan, slots, drafts, day: next };
  }
  if (!option) return plan;
  const draft = drafts[day] ?? emptyDraft;
  const deferred = draft.deferred.filter(id => id !== option.id);
  drafts[day] =
    action === 'up' ? { ...draft, deferred: [...deferred, option.id] } : { deferred, excluded: [...draft.excluded, option.id] };
  return { ...plan, drafts };
}

export function cartLines(plan: Pick<Plan, 'slots'>): CartLine[] {
  const items = new Map<string, CartLine>();
  for (const slot of Object.values(plan.slots)) {
    for (const dish of slot?.dishes ?? []) {
      const key = `${dish.day}:${dish.code}`;
      const line = items.get(key) ?? { day: dish.day, code: dish.code, name: dish.name, quantity: 0 };
      line.quantity += 1;
      items.set(key, line);
    }
  }
  return [...items.values()].sort((a, b) => a.day - b.day || a.code.localeCompare(b.code));
}

export interface OrderSummary {
  issues: Record<Day, string>;
  lines: CartLine[];
  total: number;
}

export function orderSummary(plan: Plan, eligible: Day[], catalog: Dish[], preferences: Preferences): OrderSummary {
  const issues: Record<Day, string> = {};
  const slots: Record<Day, MenuOption> = {};
  for (const [key, option] of Object.entries(plan.slots)) {
    const day = Number(key);
    if (!option || !(plan.selectedDays ?? allDays).includes(day)) continue;
    const issue = selectionIssue(option, day, eligible, catalog, preferences);
    if (issue) issues[day] = issue;
    else slots[day] = option;
  }
  return {
    issues,
    lines: cartLines({ slots }),
    total: Object.values(slots).reduce((sum, option) => sum + option.price, 0),
  };
}
