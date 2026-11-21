import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogDish, DishDetails } from '../src/core/types.ts';
import { buildWeek } from '../src/scraper/refresh.ts';

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
    { name: 'Long soup name', kcal: kcal / 2, kind: 'soup', photo: null },
    { name: 'Long main name', kcal: kcal / 2, kind: 'main', photo: '/main.jpg' },
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
