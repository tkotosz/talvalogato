const batchSize = 8;
// Distinguish responses cached before individual courses included photos.
const courseDataQuery = 'courses=3';
const catalogs = new Map();
const versions = new Map();

export async function loadJson(path, signal) {
  const loadingError = 'Nem sikerült betölteni az étlapot. Próbáld újra.';
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } }).catch(error => {
    if (signal?.aborted) throw error;
    throw new Error(loadingError, { cause: error });
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.error ?? loadingError);
  }
  return response.json().catch(error => {
    if (signal?.aborted) throw error;
    throw new Error(loadingError, { cause: error });
  });
}

export async function loadMenuCatalog(week, signal, refresh = false) {
  const cached = catalogs.get(week);
  if (!refresh && cached?.expires > Date.now()) return cached.items;
  const items = await loadJson(`/api/menu?week=${week}&catalog=10${refresh ? '&recheck=1' : ''}`, signal);
  if (!signal?.aborted) catalogs.set(week, { items, expires: Date.now() + 300_000 });
  return items;
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
        const details = await loadJson(`/api/nutrition?${query}&${courseDataQuery}`, signal);
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

  const enriched = dishes.map(dish => {
    const details = received.get(dish.id);
    if (!Number.isFinite(details?.kcal)) return { ...dish, kcal: null };
    return { ...dish, ...details, kind: details.components.length > 1 ? 'menu' : dish.kind,
      name: details.components.length === 1 ? details.components[0].name : dish.name };
  });
  return { dishes: enriched, unavailable: enriched.filter(dish => dish.kcal === null).length, failures: failures.size };
}
