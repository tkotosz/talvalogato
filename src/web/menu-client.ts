import { withDetails } from '../core/planning.ts';
import type { CatalogDish, Day, Dish, DishDetails, WeekKey } from '../core/types.ts';

const batchSize = 8;
// Part of the catalog URL, so caches never return a catalog in an older shape. Raise it when CatalogDish changes.
const catalogFormat = 3;
const catalogs = new Map<WeekKey, { items: CatalogDish[]; expires: number }>();
const versions = new Map<string, Map<string, DishDetails>>();

export async function loadJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const loadingError = 'Nem sikerült betölteni az étlapot. Próbáld újra.';
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } }).catch(error => {
    if (signal?.aborted) throw error;
    throw new Error(loadingError, { cause: error });
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(problem?.error ?? loadingError);
  }
  return response.json().catch(error => {
    if (signal?.aborted) throw error;
    throw new Error(loadingError, { cause: error });
  });
}

export async function loadMenuCatalog(week: WeekKey, signal?: AbortSignal, refresh = false): Promise<CatalogDish[]> {
  const cached = catalogs.get(week);
  if (!refresh && cached && cached.expires > Date.now()) return cached.items;
  const items = await loadJson<CatalogDish[]>(
    `/api/menu?week=${week}&format=${catalogFormat}${refresh ? '&recheck=1' : ''}`,
    signal,
  );
  if (!signal?.aborted) catalogs.set(week, { items, expires: Date.now() + 300_000 });
  return items;
}

export interface DayDishes {
  dishes: Dish[];
  /** Dishes without calorie data. */
  unavailable: number;
  /** Dishes whose details could not be loaded and may be requested again. */
  failures: number;
}

/** Adds nutrition and course details to the dishes of one day, loading only what this session has not received yet. */
export async function loadDayDishes(
  week: WeekKey,
  day: Day,
  dishes: (CatalogDish & Partial<Dish>)[],
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<DayDishes> {
  const key = `${week}:${day}`;
  const received = versions.get(key) ?? new Map<string, DishDetails>();
  versions.set(key, received);
  const pending = dishes.filter(dish => !received.has(dish.id));
  const batches: string[][] = [];
  for (let start = 0; start < pending.length; start += batchSize) {
    batches.push(pending.slice(start, start + batchSize).map(dish => dish.id));
  }

  const failures = new Set<string>();
  let completed = dishes.length - pending.length;
  onProgress(completed, dishes.length);
  async function loadBatches() {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      signal.throwIfAborted();
      try {
        const query = new URLSearchParams({ week, items: batch.join(',') });
        const details = await loadJson<DishDetails[]>(`/api/nutrition?${query}`, signal);
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

  const enriched = dishes.map(dish => withDetails(dish, received.get(dish.id)));
  return { dishes: enriched, unavailable: enriched.filter(dish => dish.kcal === null).length, failures: failures.size };
}
