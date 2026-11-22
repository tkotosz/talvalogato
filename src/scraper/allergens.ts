import { inAllergenOrder } from '../core/allergens.ts';
import type { Allergen } from '../core/types.ts';

// How Teletál writes allergens. Each course has an allergen list with short names ("Glutén, Tej, Zeller", or "-" for none),
// and its ingredient list prints the ingredients that carry an allergen in bold ("búzaliszt", "tejföl"). Words are compared
// without accents, case or anything but letters, so "Kén-dioxid" becomes "kendioxid".

/** How the words for each allergen start, both in the allergen list and in the bold ingredients. */
const wordStarts: Record<Allergen, string[]> = {
  gluten: [
    'gluten',
    'buza',
    'rozs',
    'arpa',
    'zab',
    'tonkoly',
    'durum',
    'kamut',
    'graham',
    'bulgur',
    'kuszkusz',
    'szejtan',
    'seitan',
    'liszt',
    'zsemle',
    'kenyer',
    'toast',
    'morzsa',
  ],
  crustaceans: ['rak', 'garnela', 'homar', 'langusztin', 'scampi'],
  egg: ['tojas', 'tyuktojas', 'furjtojas'],
  fish: [
    'hal',
    'tonhal',
    'tokehal',
    'lazac',
    'hekk',
    'pisztrang',
    'makrela',
    'szardella',
    'szardinia',
    'pangasius',
    'harcsa',
    'ponty',
    'sullo',
    'tilapia',
  ],
  peanut: ['foldimogyoro'],
  soy: ['szoja', 'tofu'],
  milk: [
    'tej',
    'tehentej',
    'kecsketej',
    'juhtej',
    'bivalytej',
    'iro',
    'laktoz',
    'vaj',
    'sajt',
    'marvanysajt',
    'kecskesajt',
    'juhsajt',
    'turo',
    'joghurt',
    'kefir',
    'savo',
    'kazein',
    'parmezan',
    'mozzarella',
    'mascarpone',
    'ricotta',
    'rikotta',
    'feta',
    'gouda',
    'edami',
    'trappista',
    'cheddar',
    'camembert',
    'brie',
    'ementali',
    'emmentali',
  ],
  nuts: ['dio', 'hejas', 'mandula', 'mogyoro', 'torokmogyoro', 'kesu', 'pekan', 'pisztacia', 'makadam', 'brazil'],
  celery: ['zeller'],
  mustard: ['mustar'],
  sesame: ['szezam'],
  sulfites: [
    'kendioxid',
    'szulfit',
    // The sulfite salts, E221 to E228.
    'natriumszulfit',
    'natriumhidrogenszulfit',
    'natriumbiszulfit',
    'natriummetabiszulfit',
    'natriumdiszulfit',
    'kaliummetabiszulfit',
    'kaliumdiszulfit',
    'kaliumszulfit',
    'kaliumhidrogenszulfit',
    'kaliumbiszulfit',
    'kalciumszulfit',
    'kalciumhidrogenszulfit',
    // Wine is printed in bold for its sulfites.
    'feherbor',
    'vorosbor',
    'rozebor',
  ],
  lupin: ['csillagfurt'],
  mollusks: ['puhatestu', 'kagylo', 'osztriga', 'tintahal', 'polip', 'kalmar', 'csiga'],
};

const letters = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** The allergens whose words `text` starts with. */
function allergensOf(text: string): Allergen[] {
  const word = letters(text);
  if (!word) return [];
  return (Object.keys(wordStarts) as Allergen[]).filter(allergen => wordStarts[allergen].some(start => word.startsWith(start)));
}

export interface CourseAllergens {
  /** Empty only when the list says "-" and no bold ingredient carries an allergen; null when anything was unclear. */
  allergens: Allergen[] | null;
  /** List names and bold ingredients that did not match any allergen. */
  unknown: string[];
}

/**
 * A course's allergens: the allergen lists of its parts together with the allergens of its bold ingredients. No list, an empty
 * list, or any name or bold ingredient that matches no allergen makes them unknown, so a filter never treats an unclear course
 * as free of an allergen.
 */
export function courseAllergens(lists: string[], boldIngredients: string[]): CourseAllergens {
  const found: Allergen[] = [];
  const unknown: string[] = [];
  for (const text of boldIngredients) {
    // A bold part may hold several words ("teljes kiőrlésű búzaliszt"); a hyphen joins one word ("kén-dioxid").
    const words = text.replace(/\s*-\s*/g, '-').split(/[\s,;:()/]+/);
    const matches = words.flatMap(allergensOf);
    if (matches.length) found.push(...matches);
    else unknown.push(text);
  }
  if (!lists.length) return { allergens: null, unknown };
  for (const list of lists) {
    const names = list.trim();
    if (names === '-') continue;
    const labels = names
      .split(/[,;]/)
      .map(label => label.trim())
      .filter(Boolean);
    if (!labels.length) return { allergens: null, unknown };
    for (const label of labels) {
      const matches = allergensOf(label);
      if (matches.length) found.push(...matches);
      else unknown.push(label);
    }
  }
  return { allergens: unknown.length ? null : inAllergenOrder(found), unknown };
}
