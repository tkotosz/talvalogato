import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeFilters,
  allergenIssue,
  dietIssue,
  dishAllergens,
  dishIssue,
  dislikeIssue,
  optionAllergens,
  ownDislikeWord,
} from '../src/core/filters.ts';
import { maxOwnDislikes, newPreferences, restorePreferences } from '../src/core/planning.ts';
import type { Course, Dish, Preferences } from '../src/core/types.ts';

function course(name: string, fields: Partial<Course> = {}): Course {
  return { name, kcal: 300, photo: null, allergens: [], ingredients: null, ...fields };
}

function dish(fields: Partial<Dish> = {}): Dish {
  return {
    id: '3:1:P',
    day: 3,
    type: 1,
    code: 'P',
    kind: 'main',
    name: 'Rakott zöldség',
    price: 1500,
    section: 'Főételek',
    groupId: 'Főételek',
    category: 'Főételek',
    cuisine: null,
    menuName: 'Főételek',
    weekend: false,
    pickerEligible: true,
    course: 'main',
    kcal: 600,
    diet: null,
    spicy: false,
    components: [course('Rakott zöldség')],
    ...fields,
  };
}

const allergens = (...list: Course['allergens'][]) =>
  dish({ components: list.map((value, index) => course(`F${index}`, { allergens: value })) });
const preferences = (changes: Partial<Preferences>): Preferences => ({ ...newPreferences, ...changes });

test("a dish's allergens join its courses, and any unknown course makes them unknown", () => {
  assert.deepEqual(dishAllergens(allergens(['milk', 'gluten'], ['gluten', 'egg'], [])), ['gluten', 'egg', 'milk']);
  assert.equal(dishAllergens(allergens(['milk'], null)), null);
  assert.equal(
    dishAllergens(dish({ components: [{ name: 'Régi adat', kcal: 300, photo: null }] })),
    null,
    'data read before allergens',
  );
  assert.equal(dishAllergens(dish({ components: undefined, kcal: null })), null, 'a dish without details');
  assert.deepEqual(optionAllergens({ dishes: [allergens(['milk']), allergens(['soy'])] }), ['soy', 'milk']);
  assert.equal(optionAllergens({ dishes: [allergens(['milk']), allergens(null)] }), null);
});

test('the vegetarian diet takes vegetarian and vegan lines, the vegan diet only vegan ones', () => {
  const vegetarian = preferences({ diet: 'vegetarian' });
  const vegan = preferences({ diet: 'vegan' });
  assert.equal(dietIssue(dish({ diet: 'vegetarian' }), vegetarian), null);
  assert.equal(dietIssue(dish({ diet: 'vegan' }), vegetarian), null);
  assert.equal(dietIssue(dish({ diet: null }), vegetarian), 'Nem vegetáriánus');
  assert.equal(dietIssue(dish({ diet: undefined }), vegetarian), 'Nem vegetáriánus', 'data read before diets');
  assert.equal(dietIssue(dish({ diet: 'vegan' }), vegan), null);
  assert.equal(dietIssue(dish({ diet: 'vegetarian' }), vegan), 'Nem vegán');
  assert.equal(dietIssue(dish({ diet: null }), newPreferences), null);
});

test('the allergen filter leaves out dishes with an excluded allergen and dishes whose allergens are unknown', () => {
  const filter = preferences({ filterAllergens: true, excludedAllergens: ['milk', 'gluten'] });
  assert.equal(allergenIssue(allergens(['egg'], []), filter), null);
  assert.equal(allergenIssue(allergens(['milk'], ['gluten', 'egg']), filter), 'Allergént tartalmaz: glutén, tej');
  assert.equal(allergenIssue(allergens(['egg'], null), filter), 'Nincs allergénadat');
  assert.equal(allergenIssue(allergens(null), { ...filter, filterAllergens: false }), null, 'filter switched off');
  assert.equal(allergenIssue(allergens(null), { ...filter, excludedAllergens: [] }), null, 'nothing ticked');
});

test('dislikes match word parts in names and ingredients, and some match allergens or the spicy mark', () => {
  const filter = (changes: Partial<Preferences>) => preferences({ filterDislikes: true, ...changes });
  const withIngredients = (ingredients: string, name = 'Tészta') => dish({ name, components: [course(name, { ingredients })] });
  assert.equal(
    dislikeIssue(withIngredients('penne, csiperkegomba, tejszín'), filter({ dislikes: ['mushroom'] })),
    'Kerülendő összetevő: gomba',
  );
  assert.equal(dislikeIssue(withIngredients('burgonya, majonéz'), filter({ dislikes: ['offal'] })), null, 'máj is not majonéz');
  assert.equal(dislikeIssue(withIngredients('libamáj, alma'), filter({ dislikes: ['offal'] })), 'Kerülendő összetevő: belsőség');
  assert.equal(
    dislikeIssue(withIngredients('burgonya', 'Krumplileves (kolbásszal)'), filter({ dislikes: ['pork'] })),
    'Kerülendő összetevő: sertéshús',
  );
  assert.equal(
    dislikeIssue(dish({ components: [course('Rántott filé', { allergens: ['fish'] })] }), filter({ dislikes: ['seafood'] })),
    'Kerülendő összetevő: hal és tenger gyümölcsei',
  );
  assert.equal(dislikeIssue(dish({ spicy: true }), filter({ dislikes: ['spicy'] })), 'Kerülendő összetevő: csípős');
  assert.equal(
    dislikeIssue(withIngredients('csiperkegomba'), { ...filter({ dislikes: ['mushroom'] }), filterDislikes: false }),
    null,
  );
});

test('own dislikes typed without accents match either way; typed with accents, only as typed', () => {
  const filter = (ownDislikes: string[]) => preferences({ filterDislikes: true, ownDislikes });
  const withIngredients = (ingredients: string) => dish({ components: [course('Saláta', { ingredients })] });
  assert.equal(dislikeIssue(withIngredients('saláta, Olívabogyó'), filter(['olivabogyo'])), 'Kerülendő összetevő: olivabogyo');
  assert.equal(dislikeIssue(withIngredients('saláta, olívabogyó'), filter(['olívabogyó'])), 'Kerülendő összetevő: olívabogyó');
  assert.equal(dislikeIssue(withIngredients('saláta, majonéz'), filter(['máj'])), null);
  assert.equal(ownDislikeWord('  Olíva   bogyó '), 'olíva bogyó');
  assert.equal(ownDislikeWord('ab'), null, 'too short');
});

test('a dish without ingredient data is matched on its names only', () => {
  const filter = preferences({ filterDislikes: true, dislikes: ['mushroom'] });
  assert.equal(
    dislikeIssue(dish({ name: 'Gombapaprikás', components: undefined, kcal: null }), filter),
    'Kerülendő összetevő: gomba',
  );
  assert.equal(dislikeIssue(dish({ name: 'Paprikás krumpli', components: undefined, kcal: null }), filter), null);
});

test('the dish issue names the first filter that leaves the dish out, and the active filters are listed by name', () => {
  const all = preferences({
    filterCodes: true,
    excludedCodes: ['P'],
    diet: 'vegan',
    filterAllergens: true,

    excludedAllergens: ['milk'],
    filterDislikes: true,
    dislikes: ['mushroom'],
    ownDislikes: ['olíva'],
  });
  assert.equal(dishIssue(dish({ diet: 'vegan' }), all), 'Kizárt Teletál-kód');
  assert.equal(dishIssue(dish({ code: 'Q', diet: 'vegetarian' }), all), 'Nem vegán');
  assert.equal(dishIssue(dish({ code: 'Q', diet: 'vegan' }), all), null);
  assert.deepEqual(activeFilters(all), [
    'kizárt Teletál-kódok',
    'vegán étrend',
    'allergének: tej',
    'kerülendő összetevők: gomba, olíva',
  ]);
  assert.deepEqual(activeFilters(newPreferences), []);
  assert.deepEqual(activeFilters({ ...newPreferences, limitCalories: true, limitSpending: true }), [
    'napi kalóriakeret',
    'heti költségkeret',
  ]);
});

test('restored preferences keep known filter values', () => {
  const restored = restorePreferences({
    ...newPreferences,
    diet: 'vegan',
    filterAllergens: true,

    excludedAllergens: ['milk', 'gluten', 'milk', 'chocolate'],
    filterDislikes: true,
    dislikes: ['pork', 'liver', 'mushroom'],
    ownDislikes: ['Olíva', 'olíva', 'ab', 7, ...Array.from({ length: 30 }, (_, index) => `szó${index}`)],
  });
  assert.equal(restored.diet, 'vegan');
  assert.equal(restored.filterAllergens, true);
  assert.deepEqual(restored.excludedAllergens, ['gluten', 'milk']);
  assert.deepEqual(restored.dislikes, ['mushroom', 'pork']);
  assert.equal(restored.ownDislikes.length, maxOwnDislikes);
  assert.deepEqual(restored.ownDislikes.slice(0, 2), ['olíva', 'szó0']);
  assert.equal(restorePreferences({ ...restored, diet: 'paleo' }).diet, 'all');
  // Preferences saved before these settings existed get the defaults.
  const before: Partial<Preferences> = { ...newPreferences };
  const added = ['diet', 'filterAllergens', 'excludedAllergens', 'filterDislikes', 'dislikes', 'ownDislikes'];
  for (const key of added as (keyof Preferences)[]) delete before[key];
  assert.deepEqual(restorePreferences(before), newPreferences);
});
