import { allergenNames, inAllergenOrder } from './allergens.ts';
import type { Allergen, Dish, Dislike, MenuOption, Preferences } from './types.ts';

interface DislikeRule {
  /** The name the settings show. */
  name: string;
  /**
   * Parts of words matched anywhere in a dish's names and ingredients, so "gomba" also finds "csiperkegomba" and "gombás".
   * They keep their accents, so "máj" does not find "majonéz", and stop before letters that change in inflected forms:
   * "kolbás" finds "kolbásszal".
   */
  words: string[];
  /** Allergens that count as this dislike, so dishes are found by their allergens too. */
  allergens?: Allergen[];
  /** Teletál's spicy mark counts as this dislike. */
  spicy?: true;
}

/** The common dislikes the settings offer, in the order they show them. */
export const dislikeRules: Record<Dislike, DislikeRule> = {
  mushroom: { name: 'Gomba', words: ['gomba', 'csiperke', 'vargány', 'shiitake'] },
  pork: {
    name: 'Sertéshús',
    words: ['sertés', 'disznó', 'kolbás', 'szalonn', 'bacon', 'sonka', 'csülök', 'csülk', 'tarja', 'karaj'],
  },
  beef: { name: 'Marhahús', words: ['marha', 'borjú'] },
  lamb: { name: 'Bárány', words: ['bárán'] },
  offal: { name: 'Belsőség', words: ['máj', 'zúza', 'pacal', 'velő'] },
  seafood: {
    name: 'Hal és tenger gyümölcsei',
    words: ['tonhal', 'lazac', 'hekk', 'pisztráng', 'harcsa', 'pangasius', 'tőkehal', 'halfilé', 'halászlé', 'garnéla', 'kagyló'],
    allergens: ['fish', 'crustaceans', 'mollusks'],
  },
  spicy: {
    name: 'Csípős',
    words: ['csípős', 'chili', 'jalapeño', 'erős paprika', 'erőspaprika', 'harissa', 'sriracha'],
    spicy: true,
  },
  dill: { name: 'Kapor', words: ['kapor', 'kapros'] },
  coriander: { name: 'Koriander', words: ['koriander'] },
};

export const allDislikes = Object.keys(dislikeRules) as Dislike[];

/** Lowercase text without accents. */
export function plainText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('hu');
}

/** The shortest own dislike, in letters: shorter words would match too much. */
export const minDislikeLetters = 3;

/** An own dislike as typed, tidied, or null when it is too short to match safely. */
export function ownDislikeWord(text: string): string | null {
  const word = text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('hu').slice(0, 40);
  return (word.match(/\p{L}/gu)?.length ?? 0) >= minDislikeLetters ? word : null;
}

/** The allergens of all of a dish's courses, or null when the dish has no courses or any course's allergens are unknown. */
export function dishAllergens(dish: Pick<Dish, 'components'>): Allergen[] | null {
  const courses = dish.components ?? [];
  if (!courses.length) return null;
  const found: Allergen[] = [];
  for (const course of courses) {
    if (!Array.isArray(course.allergens)) return null;
    found.push(...course.allergens);
  }
  return inAllergenOrder(found);
}

/** The allergens of all dishes of a card, such as a custom day, or null when any of them is unknown. */
export function optionAllergens(option: Pick<MenuOption, 'dishes'>): Allergen[] | null {
  const found: Allergen[] = [];
  for (const dish of option.dishes) {
    const allergens = dishAllergens(dish);
    if (!allergens) return null;
    found.push(...allergens);
  }
  return inAllergenOrder(found);
}

/** Allergen names for running text, such as "glutén, tej". */
export function allergenList(allergens: Allergen[]): string {
  return allergens.map(allergen => allergenNames[allergen].toLocaleLowerCase('hu')).join(', ');
}

export function dietIssue(dish: Dish, preferences: Pick<Preferences, 'diet'>): string | null {
  if (preferences.diet === 'vegan' && dish.diet !== 'vegan') return 'Nem vegán';
  if (preferences.diet === 'vegetarian' && !dish.diet) return 'Nem vegetáriánus';
  return null;
}

/** Why the allergen filter leaves `dish` out: it contains an excluded allergen, or its allergens are unknown. */
export function allergenIssue(
  dish: Dish,
  preferences: Pick<Preferences, 'filterAllergens' | 'excludedAllergens'>,
): string | null {
  if (!preferences.filterAllergens || !preferences.excludedAllergens.length) return null;
  const allergens = dishAllergens(dish);
  if (!allergens) return 'Nincs allergénadat';
  const found = preferences.excludedAllergens.filter(allergen => allergens.includes(allergen));
  return found.length ? `Allergént tartalmaz: ${allergenList(inAllergenOrder(found))}` : null;
}

/** The text dislikes are looked for in: the dish's names, and its ingredients where Teletál lists them. */
function dishText(dish: Dish): string {
  const courses = dish.components ?? [];
  return [dish.name, ...courses.map(course => course.name), ...courses.map(course => course.ingredients ?? '')]
    .join(' ')
    .toLocaleLowerCase('hu');
}

/** The first dislike `dish` matches, by the name the settings show, or null. */
export function dislikeIssue(
  dish: Dish,
  preferences: Pick<Preferences, 'filterDislikes' | 'dislikes' | 'ownDislikes'>,
): string | null {
  if (!preferences.filterDislikes) return null;
  const text = dishText(dish);
  const allergens = dishAllergens(dish) ?? [];
  for (const dislike of preferences.dislikes) {
    const rule = dislikeRules[dislike];
    const matches =
      rule.words.some(word => text.includes(word)) ||
      (rule.allergens?.some(allergen => allergens.includes(allergen)) ?? false) ||
      (rule.spicy === true && dish.spicy === true);
    if (matches) return `Kerülendő összetevő: ${rule.name.toLocaleLowerCase('hu')}`;
  }
  // An own word typed without accents matches with or without them; one typed with accents matches only as typed.
  const plain = plainText(text);
  const word = preferences.ownDislikes.find(own =>
    plainText(own) === own ? plain.includes(own) : text.includes(own.toLocaleLowerCase('hu')),
  );
  return word ? `Kerülendő összetevő: ${word}` : null;
}

/**
 * Why the settings leave `dish` out, or null when they allow it. The calorie limit and the weekly spending limit are
 * checked where what is left of them is known.
 */
export function dishIssue(dish: Dish, preferences: Preferences): string | null {
  if (preferences.filterCodes && preferences.excludedCodes.includes(dish.code)) return 'Kizárt Teletál-kód';
  return dietIssue(dish, preferences) ?? allergenIssue(dish, preferences) ?? dislikeIssue(dish, preferences);
}

/** The settings that leave dishes out, as the interface names them, such as "vegán étrend" or "allergének: glutén, tej". */
export function activeFilters(preferences: Preferences): string[] {
  const filters: string[] = [];
  if (preferences.limitCalories) filters.push('napi kalóriakeret');
  if (preferences.limitSpending) filters.push('heti költségkeret');
  if (preferences.filterCodes && preferences.excludedCodes.length) filters.push('kizárt Teletál-kódok');
  if (preferences.diet !== 'all') filters.push(preferences.diet === 'vegan' ? 'vegán étrend' : 'vegetáriánus étrend');
  if (preferences.filterAllergens && preferences.excludedAllergens.length)
    filters.push(`allergének: ${allergenList(preferences.excludedAllergens)}`);
  if (preferences.filterDislikes && (preferences.dislikes.length || preferences.ownDislikes.length)) {
    const names = [
      ...preferences.dislikes.map(dislike => dislikeRules[dislike].name.toLocaleLowerCase('hu')),
      ...preferences.ownDislikes,
    ];
    filters.push(`kerülendő összetevők: ${names.join(', ')}`);
  }
  return filters;
}
