import { withDetails } from '../core/planning.ts';
import type { CatalogDish, Dish, DishDetails, WeekKey } from '../core/types.ts';

/** Reads the details of dish lines from Teletál; failures come back marked retryable or with unknown calories. */
export type ReadDetails = (week: WeekKey, ids: string[]) => Promise<DishDetails[]>;

/**
 * A week's dishes: each catalog line combined with its details. Details are reused from the previous data when the
 * line is unchanged and had calories, so only new or incomplete dishes are read from Teletál again.
 */
export async function buildWeek(
  week: WeekKey,
  catalog: CatalogDish[],
  previous: Dish[],
  readDetails: ReadDetails,
): Promise<Dish[]> {
  const known = new Map(previous.map(dish => [dish.id, dish]));
  const reusable = (line: CatalogDish) => {
    const before = known.get(line.id);
    return before && before.name === line.name && before.kcal !== null ? before : null;
  };
  const missing = catalog.filter(line => !reusable(line)).map(line => line.id);
  const details = new Map((missing.length ? await readDetails(week, missing) : []).map(detail => [detail.id, detail]));

  return catalog.map(line => {
    const before = reusable(line);
    if (before) return { ...line, kind: before.kind, kcal: before.kcal, components: before.components, photo: before.photo };
    const detail = details.get(line.id);
    // A detail page that could not be read leaves the dish without calories; the next run reads it again.
    return withDetails(line, detail?.retryable ? undefined : detail);
  });
}
