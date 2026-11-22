import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogDish, Dish, DishDetails } from '../src/core/types.ts';
import { allergenCoverage, buildWeek } from '../src/scraper/refresh.ts';

const week = '2026-W48';

function line(code: string, name: string): CatalogDish {
  return {
    id: `3:1:${code}`,
    day: 3,
    type: 1,
    code,
    kind: 'menu',
    name,
    price: 1500,
    section: 'Menü',
    groupId: 'Menü',
    category: 'Menü',
    cuisine: null,
    menuName: `Menü ${code}`,
    weekend: false,
    pickerEligible: true,
    course: null,
  };
}

const details = (id: string, kcal: number): DishDetails => ({
  id,
  kcal,
  components: [
    { name: 'Long soup name', kcal: kcal / 2, kind: 'soup', photo: null, allergens: ['celery'], ingredients: 'zeller, répa' },
    { name: 'Long main name', kcal: kcal / 2, kind: 'main', photo: '/main.jpg', allergens: [], ingredients: null },
  ],
  photo: '/main.jpg',
});

/** A details reader that records which lines it was asked for. */
function reader(answers: Record<string, DishDetails>) {
  const asked: string[] = [];
  return {
    asked,
    read: async (_: string, ids: string[]) => {
      asked.push(...ids);
      return ids.map(id => answers[id] ?? { id, kcal: null, retryable: true as const });
    },
  };
}

test('a new week reads every line and combines it with its details, keeping the menu page names', async () => {
  const catalog = [line('P', 'Soup / Main'), line('PN', 'Soup2 / Main2')];
  const { asked, read } = reader({ '3:1:P': details('3:1:P', 900), '3:1:PN': details('3:1:PN', 1000) });
  const dishes = await buildWeek(week, catalog, [], read);
  assert.deepEqual(asked, ['3:1:P', '3:1:PN']);
  assert.equal(dishes[0]?.kcal, 900);
  assert.deepEqual(
    dishes[0]?.components?.map(course => course.name),
    ['Soup', 'Main'],
  );
  assert.equal(dishes[0]?.photo, '/main.jpg');
});

test('unchanged lines reuse their details; renamed lines and lines without calories are read again', async () => {
  const first = reader({ '3:1:P': details('3:1:P', 900), '3:1:PN': details('3:1:PN', 1000) });
  const previous = await buildWeek(
    week,
    [line('P', 'Soup / Main'), line('PN', 'Soup2 / Main2'), line('Q', 'Q1 / Q2')],
    [],
    first.read,
  );
  assert.equal(previous[2]?.kcal, null, 'a detail page that failed leaves the dish without calories');

  const second = reader({ '3:1:PN': details('3:1:PN', 1100), '3:1:Q': details('3:1:Q', 800), '3:1:R': details('3:1:R', 700) });
  const catalog = [
    { ...line('P', 'Soup / Main'), price: 1600 },
    line('PN', 'New soup / Main2'),
    line('Q', 'Q1 / Q2'),
    line('R', 'R1 / R2'),
  ];
  const dishes = await buildWeek(week, catalog, previous, second.read);
  assert.deepEqual(second.asked, ['3:1:PN', '3:1:Q', '3:1:R']);
  assert.equal(dishes[0]?.kcal, 900, 'reused details');
  assert.equal(dishes[0]?.price, 1600, 'catalog fields come from the new catalog');
  assert.equal(dishes[1]?.kcal, 1100);
  assert.equal(dishes[2]?.kcal, 800);
  assert.equal(dishes[3]?.kcal, 700);
});

test('a week whose lines are all known reads nothing from Teletál', async () => {
  const catalog = [line('P', 'Soup / Main')];
  const previous = await buildWeek(week, catalog, [], reader({ '3:1:P': details('3:1:P', 900) }).read);
  const again = reader({});
  assert.deepEqual(await buildWeek(week, catalog, previous, again.read), previous);
  assert.deepEqual(again.asked, []);
});

test('details written before allergens were read are read again once', async () => {
  const catalog = [line('P', 'Soup / Main')];
  const old = await buildWeek(week, catalog, [], reader({ '3:1:P': details('3:1:P', 900) }).read);
  // The shape of data written before allergens were read: courses without allergens and ingredients.
  const withoutAllergens = old.map(dish => ({
    ...dish,
    components: dish.components?.map(({ name, kcal, kind, photo }) => ({ name, kcal, kind, photo })),
  }));
  const again = reader({ '3:1:P': details('3:1:P', 950) });
  const dishes = await buildWeek(week, catalog, withoutAllergens, again.read);
  assert.deepEqual(again.asked, ['3:1:P']);
  assert.equal(dishes[0]?.kcal, 950);
  assert.deepEqual(
    dishes[0]?.components?.map(course => course.allergens),
    [['celery'], []],
  );
});

test('rereading reads every line and keeps the previous details of a line whose page cannot be read', async () => {
  const catalog = [line('P', 'Soup / Main'), line('Q', 'Q1 / Q2')];
  const previous = await buildWeek(
    week,
    catalog,
    [],
    reader({ '3:1:P': details('3:1:P', 900), '3:1:Q': details('3:1:Q', 800) }).read,
  );
  const again = reader({ '3:1:P': details('3:1:P', 990) });
  const dishes = await buildWeek(week, catalog, previous, again.read, { reread: true });
  assert.deepEqual(again.asked, ['3:1:P', '3:1:Q']);
  assert.equal(dishes[0]?.kcal, 990, 'read again');
  assert.equal(dishes[1]?.kcal, 800, 'the failed page keeps the previous details');
});

test('allergen coverage counts the courses whose allergens are known', () => {
  const known = { name: 'Leves', kcal: 200, photo: null, allergens: [] };
  const unknown = { name: 'Főétel', kcal: 600, photo: null, allergens: null };
  const old = { name: 'Desszert', kcal: 300, photo: null };
  const dish = (components: Dish['components']): Dish => ({ ...line('P', 'Soup / Main'), kcal: 1100, components });
  assert.deepEqual(allergenCoverage([dish([known, unknown]), dish([old]), { ...line('Q', 'Q1'), kcal: null }]), {
    known: 1,
    courses: 3,
  });
});
