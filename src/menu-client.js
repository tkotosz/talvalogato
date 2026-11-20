const batchSize = 8;
const versions = new Map();

export async function loadJson(path, signal) {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.error ?? 'The menu could not be loaded.');
  }
  return response.json();
}

export async function loadDayDishes(week, day, dishes, signal, onProgress) {
  const key = `${week}:${day}`;
  const received = versions.get(key) ?? new Map();
  versions.set(key, received);
  const pending = dishes.filter(dish => !received.has(dish.id));
  const batches = [];
  for (let start = 0; start < pending.length; start += batchSize) {
    batches.push(pending.slice(start, start + batchSize).map(dish => dish.id));
  }

  const failures = new Set();
  let completed = dishes.length - pending.length;
  onProgress(completed, dishes.length);
  async function loadBatches() {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      signal.throwIfAborted();
      try {
        const query = new URLSearchParams({ week, items: batch.join(',') });
        const details = await loadJson(`/api/nutrition?${query}`, signal);
        for (const detail of details) {
          if (detail.retryable) failures.add(detail.id);
          else received.set(detail.id, detail);
        }
      } catch (error) {
        if (signal.aborted) throw error;
        for (const id of batch) failures.add(id);
      }
      completed += batch.length;
      onProgress(completed, dishes.length);
    }
  }
  await Promise.all([loadBatches(), loadBatches()]);

  const enriched = dishes.flatMap(dish => {
    const details = received.get(dish.id);
    if (!details?.kcal) return [];
    return [{ ...dish, ...details, kind: details.components.length > 1 ? 'menu' : dish.kind,
      name: details.components.length === 1 ? details.components[0].name : dish.name }];
  });
  return { dishes: enriched, unavailable: dishes.length - enriched.length, failures: failures.size };
}
