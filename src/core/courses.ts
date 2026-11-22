import type { CustomCourse } from './types.ts';

/** Every course in the order a day's menu lists them. */
export const allCourses: CustomCourse[] = ['breakfast', 'soup', 'main', 'cold', 'pickle', 'bread', 'dessert', 'drink'];

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

/** Whether `stage` names a course, as trays saved before named their open deck. */
export function isCourse(stage: string): stage is CustomCourse {
  return (allCourses as string[]).includes(stage);
}
