export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const optionTypes = [
  { id: 'menuWithDessert', label: 'Teletál soup + main + dessert', badge: 'Teletál menu + dessert' },
  { id: 'menu', label: 'Teletál soup + main', badge: 'Teletál menu' },
  { id: 'triple', label: 'Custom soup + main + dessert', badge: 'Soup + main + dessert' },
  { id: 'pair', label: 'Custom soup + main', badge: 'Soup + main' },
  { id: 'single', label: 'Single dishes', badge: 'Single dish' },
];
const defaultTypes = optionTypes.map(type => type.id);
const priority = new Map(defaultTypes.map((id, index) => [id, index]));
export const newSettings = { week: '', calories: 1000, tolerance: 5, types: defaultTypes };
export const dishCodePattern = /^[A-Z0-9][A-Z0-9-]{0,15}$/i;

export function calorieLimit({ calories, tolerance }) {
  return Math.floor((calories * (100 + tolerance) + Number.EPSILON) / 10) / 10;
}

export function startPlan(settings) {
  return { id: crypto.randomUUID(), settings, day: 1, slots: {}, excluded: [], deferred: [] };
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
  const eligible = dishes.filter(dish => Number.isFinite(dish.kcal) && dish.kcal > 0 && dish.kcal <= limit);
  const desserts = eligible.filter(dish => dish.kind === 'dessert');
  const soups = eligible.filter(dish => dish.kind === 'soup');
  const mains = eligible.filter(dish => dish.kind === 'main');
  const options = eligible.flatMap(dish => {
    let kind = 'single';
    if (dish.kind === 'dessert') return [];
    if (dish.kind === 'menu') {
      const courses = new Set(dish.components?.map(course => course.kind));
      if (!courses.has('soup') || !courses.has('main')) return [];
      kind = courses.has('dessert') ? 'menuWithDessert' : 'menu';
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
  const excluded = new Set(plan.excluded);
  const deferred = new Set(plan.deferred);
  const available = options.filter(option => !excluded.has(option.id));
  const availableById = new Map(available.map(option => [option.id, option]));
  return [
    ...available.filter(option => !deferred.has(option.id)),
    ...plan.deferred.map(id => availableById.get(id)).filter(Boolean),
  ];
}

export function choose(plan, action, option) {
  if (action === 'restart') return { ...plan, excluded: [], deferred: [] };
  if (action === 'skip' || action === 'right') {
    return {
      ...plan, day: plan.day + 1, excluded: [], deferred: [],
      slots: { ...plan.slots, [plan.day]: action === 'skip' ? null : option },
    };
  }
  const deferred = plan.deferred.filter(id => id !== option.id);
  return action === 'up'
    ? { ...plan, deferred: [...deferred, option.id] }
    : { ...plan, deferred, excluded: [...plan.excluded, option.id] };
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
