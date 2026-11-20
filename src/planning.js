export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const newSettings = { week: '', calories: 1000, tolerance: 5 };
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

export function mealOptions(dishes, settings) {
  const limit = calorieLimit(settings);
  const eligible = dishes.filter(dish => Number.isFinite(dish.kcal) && dish.kcal > 0 && dish.kcal <= limit);
  const options = eligible.map(dish => ({
    id: dish.id, kind: dish.kind === 'menu' ? 'menu' : 'single', dishes: [dish],
    kcal: dish.kcal, price: dish.price, title: dish.name, photo: dish.photo,
    components: dish.components,
  }));

  const soups = eligible.filter(dish => dish.kind === 'soup');
  const mains = eligible.filter(dish => dish.kind === 'main');
  for (const soup of soups) {
    for (const main of mains) {
      const parts = [soup, main];
      const kcal = sumCalories(parts);
      if (kcal <= limit) {
        options.push({
          id: `${soup.id}+${main.id}`, kind: 'pair', dishes: parts, kcal,
          price: soup.price + main.price, title: main.name, photo: main.photo ?? soup.photo,
          components: parts.map(dish => ({ name: dish.name, kcal: dish.kcal })),
        });
      }
    }
  }

  return options.sort((a, b) => Math.abs(a.kcal - settings.calories) - Math.abs(b.kcal - settings.calories)
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
