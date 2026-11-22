import type { Allergen } from './types.ts';

/** The allergens in the order EU law lists them, with the names the interface shows. */
export const allergenNames: Record<Allergen, string> = {
  gluten: 'Glutén',
  crustaceans: 'Rákfélék',
  egg: 'Tojás',
  fish: 'Hal',
  peanut: 'Földimogyoró',
  soy: 'Szója',
  milk: 'Tej',
  nuts: 'Diófélék',
  celery: 'Zeller',
  mustard: 'Mustár',
  sesame: 'Szezámmag',
  sulfites: 'Kén-dioxid és szulfitok',
  lupin: 'Csillagfürt',
  mollusks: 'Puhatestűek',
};

export const allAllergens = Object.keys(allergenNames) as Allergen[];

/** The given allergens once each, in the order EU law lists them. */
export function inAllergenOrder(allergens: Iterable<Allergen>): Allergen[] {
  const present = new Set(allergens);
  return allAllergens.filter(allergen => present.has(allergen));
}
