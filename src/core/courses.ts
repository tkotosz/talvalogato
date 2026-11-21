import type { CustomCourse } from './types.ts';

/** Main courses, in eating order. */
export const mainCourses: CustomCourse[] = ['breakfast', 'soup', 'main'];
/** Add-ons, in the order the menu lists them. */
export const extraCourses: CustomCourse[] = ['cold', 'pickle', 'bread', 'dessert', 'drink'];
export const allCourses: CustomCourse[] = [...mainCourses, ...extraCourses];
export const defaultCourses: CustomCourse[] = ['soup', 'main'];

export const courseNames: Record<CustomCourse, string> = {
  breakfast: 'Reggeli',
  soup: 'Leves',
  main: 'Főétel',
  cold: 'Hidegkonyha',
  pickle: 'Savanyúság',
  bread: 'Cipó',
  dessert: 'Desszert',
  drink: 'Ital',
};

/** Keeps the known components of `selection`, in menu order. */
export function normalizeCourses(selection: unknown): CustomCourse[] {
  return Array.isArray(selection) ? allCourses.filter(course => selection.includes(course)) : [];
}

/** Whether a custom-day stage is one component's deck. */
export function isCourse(stage: string): stage is CustomCourse {
  return (allCourses as string[]).includes(stage);
}
