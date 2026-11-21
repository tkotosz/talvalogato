import type { CustomCourse } from './types.ts';

/** Courses the user ticks before swiping, in eating order. */
export const mealCourses: CustomCourse[] = ['breakfast', 'soup', 'main'];
/** Courses offered once the meal is known, in eating order. */
export const sideCourses: CustomCourse[] = ['pickle', 'bread', 'dessert', 'drink'];
export const defaultMealCourses: CustomCourse[] = ['soup', 'main'];

export const courseNames: Record<CustomCourse, string> = {
  breakfast: 'Reggeli',
  soup: 'Leves',
  main: 'Főétel',
  pickle: 'Savanyúság',
  bread: 'Cipó',
  dessert: 'Desszert',
  drink: 'Ital',
};

/** Keeps the courses of `selection` that belong to `from`, in eating order. */
export function normalizeCourses(selection: unknown, from: CustomCourse[]): CustomCourse[] {
  return Array.isArray(selection) ? from.filter(course => selection.includes(course)) : [];
}
