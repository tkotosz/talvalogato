import assert from 'node:assert/strict';
import test from 'node:test';
import { inAllergenOrder } from '../src/core/allergens.ts';
import { allCourses } from '../src/core/courses.ts';
import { dayCandidates, dishCodePattern, menuDeck } from '../src/core/planning.ts';
import { demoDishes, demoMenu, demoWeekKeys } from '../src/scraper/demo.ts';

const now = new Date('2026-11-21T10:00:00Z');

test('the demo publishes the current week and the three after it, marked as a demo', () => {
  assert.deepEqual(demoWeekKeys(now), ['2026-W47', '2026-W48', '2026-W49', '2026-W50']);
  const { weeks, menus } = demoMenu(now);
  assert.equal(weeks.demo, true);
  assert.equal(weeks.updatedAt, now.toISOString());
  assert.deepEqual(
    menus.map(menu => menu.week),
    weeks.weeks.map(week => week.key),
  );
});

test('a week of demo dishes is the same on every run and differs between weeks', () => {
  assert.deepEqual(demoDishes('2026-W48'), demoDishes('2026-W48'));
  assert.notDeepEqual(
    demoDishes('2026-W48').map(dish => dish.name),
    demoDishes('2026-W49').map(dish => dish.name),
  );
  assert.throws(() => demoDishes('2026-W60'), RangeError);
});

test('every day offers both menu decks and every custom-day component', () => {
  const dishes = demoDishes('2026-W48');
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const candidates = dayCandidates(dishes, day);
    assert.ok(
      candidates.some(dish => menuDeck(dish) === 'lunch'),
      `day ${day} has lunch menus`,
    );
    assert.ok(
      candidates.some(dish => menuDeck(dish) === 'fullDay'),
      `day ${day} has whole-day menus`,
    );
    for (const course of allCourses) {
      assert.ok(
        candidates.some(dish => dish.course === course),
        `day ${day} has ${course}`,
      );
    }
  }
  // Weekend days have their own whole-day lines and take everything else from Friday.
  assert.deepEqual(
    dishes.filter(dish => dish.day > 5).map(dish => [dish.day, dish.code, dish.weekend]),
    [
      [6, 'Z10', true],
      [6, 'Z11', true],
      [7, 'Z10', true],
      [7, 'Z11', true],
    ],
  );
});

test('demo dishes are complete, invented lines without photos', () => {
  const dishes = demoDishes('2026-W48');
  assert.equal(new Set(dishes.map(dish => dish.id)).size, dishes.length);
  for (const dish of dishes) {
    assert.match(dish.code, dishCodePattern);
    assert.ok(Number.isInteger(dish.price) && dish.price > 0, `${dish.id} has a price`);
    assert.ok(Number.isFinite(dish.kcal), `${dish.id} has calories`);
    assert.equal(dish.photo, null);
    assert.ok(dish.components?.every(course => course.photo === null));
    if (dish.kind === 'menu') assert.equal(dish.name.split(' / ').length, dish.components?.length);
  }
});

test('demo courses list their ingredients and allergens, and diet marks agree with them', () => {
  const meat = /hus|csirke|pulyka|sertes|marha|borju|kolbasz|sonka|szalonna|csulok|virsli|csont|hal|lazac/;
  const plainText = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  for (const dish of demoDishes('2026-W48')) {
    for (const course of dish.components ?? []) {
      assert.ok(course.ingredients, `${dish.id} lists ingredients`);
      assert.ok(Array.isArray(course.allergens), `${dish.id} has known allergens`);
      assert.deepEqual(course.allergens, inAllergenOrder(course.allergens!), `${dish.id} lists allergens in order`);
      if (!dish.diet) continue;
      assert.doesNotMatch(plainText(course.ingredients!), meat, `${dish.id} is ${dish.diet}`);
      for (const allergen of ['fish', 'crustaceans', 'mollusks'] as const) assert.ok(!course.allergens!.includes(allergen));
      if (dish.diet !== 'vegan') continue;
      for (const allergen of ['milk', 'egg'] as const) assert.ok(!course.allergens!.includes(allergen), `${dish.id} is vegan`);
      assert.doesNotMatch(plainText(course.ingredients!), /\bmez\b/, `${dish.id} is vegan`);
    }
  }
});

test('every day offers a vegan soup and two vegan mains', () => {
  const dishes = demoDishes('2026-W48');
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const vegan = dayCandidates(dishes, day).filter(dish => dish.diet === 'vegan');
    assert.ok(vegan.filter(dish => dish.course === 'soup').length >= 1, `day ${day} has a vegan soup`);
    assert.ok(vegan.filter(dish => dish.course === 'main').length >= 2, `day ${day} has two vegan mains`);
  }
});
