export const days = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
export const allDays = days.map((_, index) => index + 1);
export const menuDecks = [
  { id: 'lunch', label: 'Teletál ebéd menük' },
  { id: 'fullDay', label: 'Teletál egész napos menük' },
];
const fullDayCodes = new Set(['Z10', 'Z11', 'IRN']);
const groupNames = new Map([['CzanikBalazs', 'Czanik Balázs'], ['KlimaAnita', 'Somogyi Kovács Anita']]);
const emptyDraft = { excluded: [], deferred: [] };
export const newPreferences = {
  limitCalories: false, calories: 2000, tolerance: 10, filterCodes: false, excludedCodes: [], defaultDays: allDays,
};
export const dishCodePattern = /^[A-Z0-9][A-Z0-9-]{0,15}$/i;

export function normalizeGroupTitle(title, section) {
  if (!title || title !== title.toLocaleUpperCase('hu')) return title;
  const lower = title.toLocaleLowerCase('hu');
  const name = groupNames.get(section);
  if (name && lower.startsWith(`${name.toLocaleLowerCase('hu')} `)) return name + lower.slice(name.length);
  return lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('hu'));
}

export function calorieLimit({ calories, tolerance }) {
  return Math.floor((calories * (100 + tolerance) + Number.EPSILON) / 10) / 10;
}

export function validCalorieBudget({ calories, tolerance }) {
  return Number.isInteger(calories) && calories >= 1 && Number.isFinite(tolerance)
    && tolerance >= 0 && tolerance <= 100 && Number.isFinite(calorieLimit({ calories, tolerance }));
}

function normalizeDays(selection) {
  return Array.isArray(selection) ? allDays.filter(day => selection.includes(day)) : allDays;
}

export function restorePreferences(saved, legacy) {
  const values = saved ?? legacy;
  if (!values) return newPreferences;
  const validBudget = validCalorieBudget(values);
  const excludedCodes = Array.isArray(values.excludedCodes)
    ? [...new Set(values.excludedCodes.filter(code => typeof code === 'string' && dishCodePattern.test(code)).map(code => code.toUpperCase()))]
    : [];
  return {
    limitCalories: validBudget && (saved ? saved.limitCalories === true : true),
    calories: validBudget ? values.calories : newPreferences.calories,
    tolerance: validBudget ? values.tolerance : newPreferences.tolerance,
    filterCodes: saved ? saved.filterCodes === true : excludedCodes.length > 0,
    excludedCodes,
    defaultDays: normalizeDays(values.defaultDays),
  };
}

export function startPlan(week, day, selectedDays = allDays) {
  return { id: crypto.randomUUID(), week, day, selectedDays: normalizeDays(selectedDays), slots: {}, drafts: {} };
}

export function restorePlan({ id, week, settings, day, selectedDays, slots, drafts, excluded, deferred }) {
  const activeDay = Number.isInteger(day) && day >= 1 && day <= days.length ? day : null;
  return {
    id, week: week ?? settings?.week, day: activeDay, selectedDays: normalizeDays(selectedDays), slots: slots ?? {},
    drafts: drafts ?? (activeDay && (excluded || deferred) ? {
      [activeDay]: { excluded: excluded ?? [], deferred: deferred ?? [] },
    } : {}),
  };
}

// Teletál delivers weekend meals on Friday. A weekend day offers the lines Teletál publishes for that day,
// plus Friday's lines for codes without a separate weekend line, such as the lunch sets.
export function dayCandidates(catalog, day) {
  const ownCodes = new Set(catalog.filter(dish => dish.day === day).map(dish => dish.code));
  return catalog.filter(dish => dish.day === day || (day > 5 && dish.day === 5 && !ownCodes.has(dish.code)));
}

export function menuDeck(dish) {
  if (fullDayCodes.has(dish.code)) return 'fullDay';
  if (dish.code === 'IR') return 'lunch';
  if (dish.kind !== 'menu' || dish.pickerEligible === false) return null;
  if (!dish.components?.length) return 'lunch';
  const kinds = new Set(dish.components.map(course => course.kind));
  return kinds.has('soup') && kinds.has('main') ? 'lunch' : null;
}

export function matchesCalorieLimit(kcal, preferences) {
  return !preferences.limitCalories || (Number.isFinite(kcal) && kcal >= 0 && kcal <= calorieLimit(preferences));
}

export function mealOptions(dishes, preferences, deck) {
  const excluded = new Set(preferences.filterCodes ? preferences.excludedCodes : []);
  const options = dishes.filter(dish => menuDeck(dish) === deck && !excluded.has(dish.code)
    && matchesCalorieLimit(dish.kcal, preferences)).map(dish => ({
    id: dish.id, kind: 'menu', dishes: [dish], kcal: dish.kcal ?? null, price: dish.price,
    title: dish.name, photo: dish.photo, components: dish.components,
  }));
  if (preferences.limitCalories) options.sort((a, b) =>
    Math.abs(a.kcal - preferences.calories) - Math.abs(b.kcal - preferences.calories) || a.price - b.price);
  return options;
}

export function selectionIssue(option, day, eligible, catalog, preferences) {
  const candidates = dayCandidates(catalog, day);
  if (!eligible.includes(day) || option.dishes.some(dish => !candidates.some(item => item.day === dish.day && item.code === dish.code))) {
    return 'Már nem rendelhető';
  }
  if (preferences.filterCodes && option.dishes.some(dish => preferences.excludedCodes.includes(dish.code))) return 'Kizárt Teletál-kód';
  if (!matchesCalorieLimit(option.kcal, preferences)) return Number.isFinite(option.kcal) ? 'Kalóriakereten felül' : 'Nincs kalóriaadat';
  return null;
}

export function dayQueue(options, plan) {
  const draft = plan.drafts[plan.day] ?? emptyDraft;
  const excluded = new Set(draft.excluded);
  const deferred = new Set(draft.deferred);
  const available = options.filter(option => !excluded.has(option.id));
  const availableById = new Map(available.map(option => [option.id, option]));
  return [
    ...available.filter(option => !deferred.has(option.id)),
    ...draft.deferred.map(id => availableById.get(id)).filter(Boolean),
  ];
}

export function choose(plan, action, option, eligible) {
  const { day } = plan;
  const drafts = { ...plan.drafts };
  if (action === 'restart') {
    delete drafts[day];
    return { ...plan, drafts };
  }
  if (action === 'skip' || action === 'right') {
    const slots = { ...plan.slots, [day]: action === 'skip' ? null : option };
    delete drafts[day];
    const pending = eligible.filter(candidate => !Object.hasOwn(slots, candidate));
    const next = pending.find(candidate => candidate > day) ?? pending[0] ?? null;
    return { ...plan, slots, drafts, day: next };
  }
  const draft = drafts[day] ?? emptyDraft;
  const deferred = draft.deferred.filter(id => id !== option.id);
  drafts[day] = action === 'up'
    ? { ...draft, deferred: [...deferred, option.id] }
    : { deferred, excluded: [...draft.excluded, option.id] };
  return { ...plan, drafts };
}

export function cartLines(plan) {
  const items = new Map();
  for (const slot of Object.values(plan.slots)) {
    for (const dish of slot?.dishes ?? []) {
      const key = `${dish.day}:${dish.code}`;
      if (!items.has(key)) items.set(key, { day: dish.day, code: dish.code, name: dish.name, quantity: 0 });
      items.get(key).quantity += 1;
    }
  }
  return [...items.values()].sort((a, b) => a.day - b.day || a.code.localeCompare(b.code));
}

export function orderSummary(plan, eligible, catalog, preferences) {
  const issues = {};
  const slots = {};
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
