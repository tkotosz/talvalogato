import type { Dish, MenuWeek, MenuWeeks, WeekKey } from '../core/types.ts';

const weeks = new Map<WeekKey, { dishes: Dish[]; expires: number }>();

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

/** The published weeks and when the menu data was last refreshed. */
export function loadMenuWeeks(signal?: AbortSignal): Promise<MenuWeeks> {
  return loadJson<MenuWeeks>('/api/weeks', signal);
}

/** A week's dishes with their details, kept for five minutes so moving between screens does not load them again. */
export async function loadMenuCatalog(week: WeekKey, signal?: AbortSignal): Promise<Dish[]> {
  const cached = weeks.get(week);
  if (cached && cached.expires > Date.now()) return cached.dishes;
  const { dishes } = await loadJson<MenuWeek>(`/api/menu?week=${week}`, signal);
  if (!signal?.aborted) weeks.set(week, { dishes, expires: Date.now() + 300_000 });
  return dishes;
}
