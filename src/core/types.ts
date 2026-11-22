/** Day of the delivery week: 1 is Monday, 7 is Sunday. */
export type Day = number;

/** ISO week key such as `2026-W48`. */
export type WeekKey = string;

export interface PublishedWeek {
  key: WeekKey;
}

/** The published weeks, as the menu data job last read them. */
export interface MenuWeeks {
  /** When the data was last refreshed, as an ISO time. */
  updatedAt: string;
  /** Set when the menus are invented for the demo; the app then says so and hides the cart. */
  demo?: true;
  weeks: PublishedWeek[];
}

/** One week's menu: every orderable line with its details. The refresh time lives in MenuWeeks, so this file only
 * changes when the menu does. */
export interface MenuWeek {
  week: WeekKey;
  dishes: Dish[];
}

export type DishKind = 'menu' | 'soup' | 'main' | 'dessert';

/** A component of a custom day: a main course or an add-on. */
export type CustomCourse = 'breakfast' | 'soup' | 'main' | 'cold' | 'pickle' | 'bread' | 'dessert' | 'drink';
export type CourseKind = 'soup' | 'main' | 'dessert' | 'side';

/** The 14 allergens EU law requires food sellers to declare. */
export type Allergen =
  | 'gluten'
  | 'crustaceans'
  | 'egg'
  | 'fish'
  | 'peanut'
  | 'soy'
  | 'milk'
  | 'nuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulfites'
  | 'lupin'
  | 'mollusks';

/** A diet mark Teletál gives a line. Vegan lines are vegetarian too. */
export type Diet = 'vegetarian' | 'vegan';

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
  /** Promotion lines Teletál shows under the name, as written there, or null. */
  note?: string | null;
  /** Teletál's diet mark for the line, or null when it has none. Missing in data written before diets were read. */
  diet?: Diet | null;
  /** Teletál marks the line as spicy. */
  spicy?: boolean;
}

export interface Course {
  name: string;
  kcal: number;
  kind?: CourseKind;
  photo: string | null;
  /**
   * The allergens Teletál declares for the course: its allergen list together with the ingredients it prints in bold.
   * Empty only when Teletál wrote "-" for none. Null when the course's allergens are unknown, and missing in data written
   * before allergens were read; both count as unknown.
   */
  allergens?: Allergen[] | null;
  /** The ingredient list as Teletál writes it, or null when it shows none. */
  ingredients?: string | null;
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
  /** A Teletál set menu, or a custom day made of single dishes. */
  kind: 'menu' | 'custom';
  dishes: Dish[];
  kcal: number | null;
  price: number;
  title: string;
  photo?: string | null;
  components?: Course[];
  /** How a custom day was put together, so editing can restore it. */
  custom?: CustomChoice;
}

/** The components a custom day was built from, including ones left without a dish. */
export interface CustomChoice {
  courses: CustomCourse[];
  /** The user chose to go over the calorie limit for this day. */
  overLimit: boolean;
}

/** Where the custom-day flow is: the component selection, the menu overview, a component's deck, or a generated menu. */
export type CustomStage = 'select' | 'overview' | CustomCourse | 'generated';

/** What a generated day needs to continue: the random sequence and how often each dish was offered, by dish ID. */
export interface Generator {
  seed: number;
  shown: Record<string, number>;
}

/** A custom day in progress. */
export interface CustomDraft {
  courses: CustomCourse[];
  stage: CustomStage;
  /** The dish picked for each component that has one. */
  picks: Partial<Record<CustomCourse, Dish>>;
  /** Components whose deck shows dishes beyond the calorie limit. */
  overLimit: CustomCourse[];
  /** Set when the app generates whole menus for this day instead of the user picking each dish. */
  generator?: Generator;
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
  /** Swipe history per day, shared by the set-menu decks and the course decks. */
  drafts: Record<Day, DayDraft>;
  /** Custom days in progress. */
  custom: Record<Day, CustomDraft>;
}

/** A common dislike the settings offer, such as mushrooms or pork. */
export type Dislike = 'mushroom' | 'pork' | 'beef' | 'lamb' | 'offal' | 'seafood' | 'spicy' | 'dill' | 'coriander';

export interface Preferences {
  limitCalories: boolean;
  calories: number;
  tolerance: number;
  filterCodes: boolean;
  excludedCodes: string[];
  defaultDays: Day[];
  /** The components ticked on the last custom day. */
  customCourses: CustomCourse[];
  /** Every dish, or only the dishes Teletál marks vegetarian (vegan ones included) or vegan. */
  diet: 'all' | Diet;
  /** Leave out the dishes that contain an excluded allergen, and those whose allergens are unknown. */
  filterAllergens: boolean;
  excludedAllergens: Allergen[];
  /** Leave out the dishes whose names or ingredients mention a dislike. */
  filterDislikes: boolean;
  dislikes: Dislike[];
  /** Words of the user's own, matched like the common dislikes. */
  ownDislikes: string[];
}

export type MenuDeckId = 'lunch' | 'fullDay';

export interface CartLine {
  day: Day;
  code: string;
  name: string;
  quantity: number;
}
