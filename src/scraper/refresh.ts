import { withDetails } from '../core/planning.ts';
import type { CatalogDish, Dish, DishDetails, WeekKey } from '../core/types.ts';

/** Reads the details of dish lines from Teletál; failures come back marked retryable or with unknown calories. */
export type ReadDetails = (week: WeekKey, ids: string[]) => Promise<DishDetails[]>;

export interface BuildOptions {
  /** Read every line's details again, so corrections Teletál makes to unchanged lines arrive. */
  reread?: boolean;
}

/**
 * A week's dishes: each catalog line combined with its details. Details are reused from the previous data when the line is
 * unchanged and they are complete, so only new or incomplete dishes are read from Teletál again. With `reread`, every line is
 * read; a line whose page cannot be read then keeps its previous details.
 */
export async function buildWeek(
  week: WeekKey,
  catalog: CatalogDish[],
  previous: Dish[],
  readDetails: ReadDetails,
  { reread = false }: BuildOptions = {},
): Promise<Dish[]> {
  const known = new Map(previous.map(dish => [dish.id, dish]));
  const reusable = (line: CatalogDish) => {
    const before = known.get(line.id);
    if (!before || before.name !== line.name || before.kcal === null) return null;
    // Data written before allergens were read has no `allergens` field on its courses; such details are read again.
    return before.components?.every(course => course.allergens !== undefined) ? before : null;
  };
  const missing = catalog.filter(line => reread || !reusable(line)).map(line => line.id);
  const details = new Map((missing.length ? await readDetails(week, missing) : []).map(detail => [detail.id, detail]));

  return catalog.map(line => {
    const before = reusable(line);
    const detail = details.get(line.id);
    if (before && (!detail || detail.retryable)) {
      return { ...line, kind: before.kind, kcal: before.kcal, components: before.components, photo: before.photo };
    }
    // A detail page that could not be read leaves the dish without calories; the next run reads it again.
    return withDetails(line, detail?.retryable ? undefined : detail);
  });
}

/**
 * The share of courses with known allergens a run needs. Some courses lack an allergen row on Teletál, but when many do, the
 * page markup has most likely changed and the run must not replace the previous data.
 */
export const minAllergenCoverage = 0.9;

/** How many courses of `dishes` have known allergens, out of all their courses. */
export function allergenCoverage(dishes: Dish[]): { known: number; courses: number } {
  const courses = dishes.flatMap(dish => dish.components ?? []);
  return { known: courses.filter(course => Array.isArray(course.allergens)).length, courses: courses.length };
}
