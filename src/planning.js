export const days = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
export const optionTypes = [
  // Keep the original ID for saved settings and choices.
  { id: 'menuWithDessert', label: '3 fogásos Teletál-menü', badge: '3 fogásos Teletál-menü' },
  { id: 'menu', label: '2 fogásos Teletál-menü', badge: '2 fogásos Teletál-menü' },
  { id: 'triple', label: 'Saját menü (leves + főétel + desszert)', badge: 'Leves + főétel + desszert' },
  { id: 'pair', label: 'Saját menü (leves + főétel)', badge: 'Leves + főétel' },
  { id: 'single', label: 'Önálló ételek', badge: 'Önálló étel' },
];
const defaultTypes = optionTypes.map(type => type.id);
const priority = new Map(defaultTypes.map((id, index) => [id, index]));
const emptyDraft = { excluded: [], deferred: [] };
export const newSettings = { week: '', calories: 2000, tolerance: 10, types: defaultTypes, excludedCodes: [] };
export const dishCodePattern = /^[A-Z0-9][A-Z0-9-]{0,15}$/i;

export function calorieLimit({ calories, tolerance }) {
  return Math.floor((calories * (100 + tolerance) + Number.EPSILON) / 10) / 10;
}

export function startPlan(settings) {
  return { id: crypto.randomUUID(), settings, day: 1, slots: {}, drafts: {} };
}

export function restorePlan({ excluded, deferred, ...plan }) {
  return {
    ...plan,
    drafts: plan.drafts ?? (plan.day <= days.length ? {
      [plan.day]: { excluded: excluded ?? [], deferred: deferred ?? [] },
    } : {}),
  };
}

export function sourceDay(day) {
  return Math.min(day, 5);
}

const sumCalories = dishes => Math.round(dishes.reduce((sum, dish) => sum + dish.kcal, 0) * 10) / 10;

function customCombo(dishes, kcal) {
  const [soup, main] = dishes;
  return {
    id: dishes.map(dish => dish.id).join('+'), kind: dishes.length === 3 ? 'triple' : 'pair', dishes,
    kcal, price: dishes.reduce((sum, dish) => sum + dish.price, 0),
    title: main.name, photo: main.photo ?? soup.photo,
    components: dishes.map(dish => ({ name: dish.name, kcal: dish.kcal })),
  };
}

export function mealOptions(dishes, settings) {
  const limit = calorieLimit(settings);
  const enabled = new Set(settings.types ?? defaultTypes);
  const excludedCodes = new Set(settings.excludedCodes);
  const eligible = dishes.filter(dish => !excludedCodes.has(dish.code)
    && Number.isFinite(dish.kcal) && dish.kcal > 0 && dish.kcal <= limit);
  const desserts = eligible.filter(dish => dish.kind === 'dessert');
  const soups = eligible.filter(dish => dish.kind === 'soup');
  const mains = eligible.filter(dish => dish.kind === 'main');
  const options = eligible.flatMap(dish => {
    let kind = 'single';
    if (dish.kind === 'dessert') return [];
    if (dish.kind === 'menu') {
      const components = dish.components ?? [];
      const courseKinds = new Set(components.map(course => course.kind));
      if (!courseKinds.has('soup') || !courseKinds.has('main')) return [];
      kind = components.length > 2 ? 'menuWithDessert' : 'menu';
    }
    if (!enabled.has(kind)) return [];
    return [{
      id: dish.id, kind, dishes: [dish], kcal: dish.kcal, price: dish.price,
      title: dish.name, photo: dish.photo, components: dish.components,
    }];
  });

  if (enabled.has('pair') || enabled.has('triple')) {
    for (const soup of soups) {
      for (const main of mains) {
        const pair = [soup, main];
        const pairCalories = sumCalories(pair);
        if (pairCalories > limit) continue;
        if (enabled.has('pair')) options.push(customCombo(pair, pairCalories));
        if (enabled.has('triple')) {
          for (const dessert of desserts) {
            const triple = [...pair, dessert];
            const kcal = sumCalories(triple);
            if (kcal <= limit) options.push(customCombo(triple, kcal));
          }
        }
      }
    }
  }

  return options.sort((a, b) => priority.get(a.kind) - priority.get(b.kind)
    || Math.abs(a.kcal - settings.calories) - Math.abs(b.kcal - settings.calories)
    || a.price - b.price || a.title.localeCompare(b.title, 'hu'));
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

export function choose(plan, action, option) {
  const { day } = plan;
  const drafts = { ...plan.drafts };
  if (action === 'restart') {
    const slots = { ...plan.slots };
    delete slots[day];
    delete drafts[day];
    return { ...plan, slots, drafts };
  }
  if (action === 'skip' || action === 'right') {
    const slots = { ...plan.slots, [day]: action === 'skip' ? null : option };
    delete drafts[day];
    const pending = days.map((_, index) => index + 1).filter(candidate => !Object.hasOwn(slots, candidate));
    const next = pending.find(candidate => candidate > day) ?? pending[0] ?? days.length + 1;
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
