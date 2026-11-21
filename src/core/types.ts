/** Day of the delivery week: 1 is Monday, 7 is Sunday. */
export type Day = number;

/** ISO week key such as `2026-W48`. */
export type WeekKey = string;

export interface PublishedWeek {
  key: WeekKey;
}

export type DishKind = 'menu' | 'soup' | 'main' | 'dessert';

/** A course of a custom day, in eating order: meal courses first, then side courses. */
export type CustomCourse = 'breakfast' | 'soup' | 'main' | 'pickle' | 'bread' | 'dessert' | 'drink';
export type CourseKind = 'soup' | 'main' | 'dessert' | 'side';

/** One orderable line of the Teletál weekly menu, as read from the menu page. */
export interface CatalogDish {
  /** `day:type:code`, unique within a week. */
  id: string;
  day: Day;
  type: number;
  code: string;
  kind: DishKind;
  name: string;
  price: number;
  section: string;
  groupId: string;
  category: string;
  cuisine: string | null;
  menuName: string;
  weekend: boolean;
  pickerEligible: boolean;
  /** The custom-day course this dish can fill, or null for set menus and dishes outside the courses. */
  course: CustomCourse | null;
}

export interface Course {
  name: string;
  kcal: number;
  kind?: CourseKind;
  photo: string | null;
}

/** Nutrition and courses of one catalog line, read from its detail page. */
export interface DishDetails {
  id: string;
  kcal: number | null;
  components?: Course[];
  photo?: string | null;
  /** Set when Teletál could not be reached, so the details may be requested again. */
  retryable?: true;
}

/** A catalog line together with whatever details have been loaded for it. */
export interface Dish extends CatalogDish {
  kcal: number | null;
  components?: Course[];
  photo?: string | null;
}

/** A card in a swipe deck, and what a day stores once it is picked. */
export interface MenuOption {
  id: string;
  kind: 'menu';
  dishes: Dish[];
  kcal: number | null;
  price: number;
  title: string;
  photo?: string | null;
  components?: Course[];
}

export interface DayDraft {
  excluded: string[];
  deferred: string[];
}

export interface Plan {
  id: string;
  week: WeekKey;
  /** The day being planned, or null when every eligible day has a decision. */
  day: Day | null;
  selectedDays: Day[];
  /** A picked menu, or null when the day was skipped. Days without a decision have no entry. */
  slots: Record<Day, MenuOption | null>;
  drafts: Record<Day, DayDraft>;
}

export interface Preferences {
  limitCalories: boolean;
  calories: number;
  tolerance: number;
  filterCodes: boolean;
  excludedCodes: string[];
  defaultDays: Day[];
}

export type MenuDeckId = 'lunch' | 'fullDay';

export interface CartLine {
  day: Day;
  code: string;
  name: string;
  quantity: number;
}
