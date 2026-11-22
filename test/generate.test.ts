import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMenu, generationProblem, nextRandom, startGenerator } from '../src/core/generate.ts';
import {
  initialPlanner,
  reducePlanner,
  type PlannerAction,
  type PlannerContext,
  type PlannerState,
} from '../src/core/planner.ts';
import { calorieLimit, newPreferences, orderSummary } from '../src/core/planning.ts';
import type { CustomCourse, Day, Dish, Preferences } from '../src/core/types.ts';

const w48 = '2026-W48';
// Saturday 21 November 2026: next week's Wednesday (day 3) is the first orderable day.
const now = new Date('2026-11-21T10:00:00Z');
const weeks = [{ key: '2026-W48' }];

function dish(code: string, course: CustomCourse, kcal: number | null, day: Day = 3): Dish {
  return {
    id: `${day}:1:${code}`,
    day,
    type: 1,
    code,
    kind: course === 'soup' ? 'soup' : course === 'dessert' ? 'dessert' : 'main',
    name: `${code} dish`,
    price: 1000,
    section: course,
    groupId: course,
    category: course,
    cuisine: null,
    menuName: code,
    weekend: false,
    pickerEligible: true,
    course,
    kcal,
  };
}

const soups = [dish('A1', 'soup', 300), dish('A2', 'soup', 450), dish('A3', 'soup', 150)];
const mains = [dish('I1', 'main', 700), dish('I2', 'main', 1400), dish('I3', 'main', 550), dish('I4', 'main', 880)];
const desserts = [dish('S1', 'dessert', 400), dish('S2', 'dessert', 60)];
const drink = dish('NF1', 'drink', null);
const catalog = [...soups, ...mains, ...desserts, drink, ...[4, 5].map(day => dish('A1', 'soup', 300, day))];
const context: PlannerContext = { weeks, catalog, now };
const limited: Preferences = { ...newPreferences, limitCalories: true, calories: 1000, tolerance: 10 };

function run(state: PlannerState, ...actions: PlannerAction[]): PlannerState {
  return actions.reduce((current, action) => reducePlanner(current, action, context), state);
}
/** A tray built course by course that asks for an idea for its empty soup and main. */
function generatedDay(preferences: Preferences = newPreferences, seed = 7, ...before: PlannerAction[]): PlannerState {
  return run(
    initialPlanner({}, preferences),
    { type: 'navigate', step: 'meals' },
    { type: 'addCourse', day: 3, course: 'soup' },
    { type: 'addCourse', day: 3, course: 'main' },
    ...before,
    {
      type: 'startGenerated',
      day: 3,
      seed,
    },
  );
}
const draft = (state: PlannerState) => state.plans[w48]!.custom[3]!;
/** The dish codes on the tray's rows, by row. */
const codes = (state: PlannerState) => draft(state).rows.map(row => row.dish?.code ?? null);
const total = (dishes: (Dish | undefined)[]) => dishes.reduce((sum, item) => sum + (item?.kcal ?? 0), 0);

test('the seeded sequence repeats for the same seed and stays within [0, 1)', () => {
  let seed = 42;
  const values: number[] = [];
  for (let index = 0; index < 1000; index++) {
    const next = nextRandom(seed);
    values.push(next.value);
    seed = next.seed;
  }
  assert.ok(values.every(value => value >= 0 && value < 1));
  assert.equal(nextRandom(42).value, values[0]);
  assert.ok(new Set(values).size > 990, 'the values do not repeat early');
});

test('a generated menu has a dish for each row that has dishes, and rows of the same course get different ones', () => {
  const { dishes } = generateMenu(catalog, ['soup', 'main', 'cold', 'main'], newPreferences, startGenerator(1));
  assert.equal(dishes[0]?.course, 'soup');
  assert.equal(dishes[1]?.course, 'main');
  assert.equal(dishes[2], undefined, 'no cold dish today');
  assert.equal(dishes[3]?.course, 'main');
  assert.notEqual(dishes[1]?.code, dishes[3]?.code);
});

test('every dish is offered once before any dish comes back', () => {
  let generator = startGenerator(3);
  const offered: string[] = [];
  for (let round = 0; round < mains.length; round++) {
    const next = generateMenu(catalog, ['main'], newPreferences, generator);
    offered.push(next.dishes[0]!.code);
    generator = next.generator;
  }
  assert.deepEqual(offered.sort(), ['I1', 'I2', 'I3', 'I4']);
  assert.deepEqual(generator.shown, { '3:1:I1': 1, '3:1:I2': 1, '3:1:I3': 1, '3:1:I4': 1 });
});

test('with a calorie limit every menu fits and leaves room for the courses after the main', () => {
  const limit = calorieLimit(limited);
  let generator = startGenerator(11);
  const mainsOffered = new Set<string>();
  for (let round = 0; round < 40; round++) {
    const next = generateMenu(catalog, ['soup', 'main', 'dessert', 'drink'], limited, generator);
    const [soup, main, dessert, drink] = next.dishes;
    assert.equal(drink, undefined, 'a drink without calories cannot count toward the limit');
    assert.ok(soup && main && dessert);
    assert.ok(total(next.dishes) <= limit, `${total(next.dishes)} kcal fits ${limit}`);
    mainsOffered.add(main.code);
    generator = next.generator;
  }
  // 1,400 kcal never fits under 1,100; 880 kcal fits only with the lightest soup and dessert (150 + 60).
  assert.deepEqual([...mainsOffered].sort(), ['I1', 'I3', 'I4']);
});

test('generation reports an empty choice and a limit the lightest dishes exceed', () => {
  assert.equal(generationProblem(catalog, ['cold'], newPreferences), 'empty');
  assert.equal(generationProblem(catalog, ['soup', 'main'], limited), null);
  const tight = { ...limited, calories: 600, tolerance: 0 };
  assert.equal(generationProblem(catalog, ['soup', 'main', 'dessert'], tight), 'limit');
  assert.deepEqual(generateMenu(catalog, ['soup', 'main', 'dessert'], tight, startGenerator(1)).dishes, [
    undefined,
    undefined,
    undefined,
  ]);
  const excluded = { ...newPreferences, filterCodes: true, excludedCodes: ['I1', 'I2', 'I3', 'I4'] };
  const { dishes } = generateMenu(catalog, ['soup', 'main'], excluded, startGenerator(1));
  assert.equal(dishes[0]?.course, 'soup');
  assert.equal(dishes[1], undefined);
});

test('an idea fills the empty soup and main rows of the tray and waits to be kept', () => {
  const state = generatedDay();
  assert.equal(draft(state).stage, 'generated');
  assert.deepEqual(draft(state).generator?.rows, [0, 1]);
  assert.ok(codes(state).every(code => code !== null));
  // An idea waits to be kept: no tray, decks, or row changes yet.
  assert.equal(run(state, { type: 'openStage', day: 3, stage: 'overview' }), state);
  assert.equal(run(state, { type: 'openStage', day: 3, stage: 1 }), state);
  assert.equal(run(state, { type: 'clearCourse', day: 3 }), state);
  assert.equal(run(state, { type: 'removeCourse', day: 3, row: 0 }), state);
});

test('the same seed generates the same menus, so tests and a reload agree', () => {
  const first = generatedDay(newPreferences, 5);
  assert.deepEqual(codes(first), codes(generatedDay(newPreferences, 5)));
  const restored = JSON.parse(JSON.stringify(first)) as PlannerState;
  assert.deepEqual(
    codes(run(restored, { type: 'rejectGenerated', day: 3 })),
    codes(run(first, { type: 'rejectGenerated', day: 3 })),
  );
});

test('rejecting an idea brings a different main until every main was offered', () => {
  let state = generatedDay();
  const offered = [codes(state)[1]];
  for (let round = 1; round < mains.length; round++) {
    state = run(state, { type: 'rejectGenerated', day: 3 });
    offered.push(codes(state)[1]);
  }
  assert.equal(new Set(offered).size, mains.length);
  assert.equal(state.plans[w48]!.slots[3], undefined, 'rejecting does not decide the day');
});

test('keeping an idea puts it on the tray, where extras can join before leaving the day saves it', () => {
  let state = generatedDay();
  const { rows } = draft(state);
  state = run(state, { type: 'acceptGenerated', day: 3 });
  assert.deepEqual(draft(state), { rows, stage: 'overview', overLimit: [] });
  assert.ok(!Object.hasOwn(state.plans[w48]!.slots, 3), 'nothing is saved while the day is open');

  state = run(
    state,
    { type: 'addCourse', day: 3, course: 'dessert' },
    { type: 'openStage', day: 3, stage: 2 },
    { type: 'pickCourse', day: 3, dish: desserts[1]! },
    { type: 'navigate', step: 'overview' },
  );
  const saved = state.plans[w48]!.slots[3]!;
  assert.equal(saved.kind, 'custom');
  assert.deepEqual(saved.custom, { courses: ['soup', 'main', 'dessert'], overLimit: false });
  assert.deepEqual(
    orderSummary(state.plans[w48]!, [3, 4, 5], catalog, newPreferences).lines.map(line => line.code),
    [rows[0]!.dish!.code, rows[1]!.dish!.code, 'S2'].sort(),
  );
});

test('an idea that no longer fits the settings is replaced instead of kept', () => {
  let state = generatedDay();
  const shown = codes(state)[1]!;
  state = run(state, {
    type: 'savePreferences',
    preferences: { ...state.preferences, filterCodes: true, excludedCodes: [shown] },
  });
  state = run(state, { type: 'acceptGenerated', day: 3 });
  assert.equal(draft(state).stage, 'generated');
  assert.notEqual(codes(state)[1], shown);
});

test('a day with nothing to generate shows the idea stage without a menu', () => {
  const nothing = { ...newPreferences, filterCodes: true, excludedCodes: [...soups, ...mains].map(item => item.code) };
  const state = generatedDay(nothing);
  assert.equal(draft(state).stage, 'generated');
  assert.deepEqual(codes(state), [null, null]);
  assert.equal(run(state, { type: 'acceptGenerated', day: 3 }), state);
});

test('an idea fills only the empty rows and fits the calories the rest of the tray leaves', () => {
  const pickMain = (main: Dish): PlannerAction[] => [
    { type: 'openStage', day: 3, stage: 1 },
    { type: 'pickCourse', day: 3, dish: main },
  ];
  // 1100 kcal in all; the 880 kcal main leaves room only for the 150 kcal soup.
  const state = generatedDay(limited, 7, ...pickMain(mains[3]!));
  assert.deepEqual(draft(state).generator?.rows, [0]);
  assert.deepEqual(codes(state), ['A3', 'I4']);
  assert.equal(generationProblem(catalog, ['soup'], limited, 1000), 'limit');
});

test('Vissza from an idea returns to the tray as it was, and a tray without empty rows gets no idea', () => {
  const tray = run(
    initialPlanner({}, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'addCourse', day: 3, course: 'soup' },
    { type: 'addCourse', day: 3, course: 'main' },
  );
  const state = run(tray, { type: 'startGenerated', day: 3, seed: 7 });
  assert.equal(draft(state).stage, 'generated');
  assert.deepEqual(draft(run(state, { type: 'cancelGenerated', day: 3 })), draft(tray));

  const full = run(
    tray,
    { type: 'openStage', day: 3, stage: 0 },
    { type: 'pickCourse', day: 3, dish: soups[0]! },
    { type: 'openStage', day: 3, stage: 1 },
    { type: 'pickCourse', day: 3, dish: mains[0]! },
  );
  assert.equal(run(full, { type: 'startGenerated', day: 3, seed: 7 }), full);
  assert.equal(
    run(initialPlanner({}, newPreferences), { type: 'navigate', step: 'meals' }, { type: 'startGenerated', day: 3, seed: 7 })
      .plans[w48]!.custom[3],
    undefined,
    'an idea needs a tray',
  );
});

test('an idea fills every empty row, extras and repeated courses included, and next to a set menu only the extras', () => {
  const withExtras = generatedDay(
    newPreferences,
    7,
    { type: 'addCourse', day: 3, course: 'dessert' },
    { type: 'addCourse', day: 3, course: 'dessert' },
  );
  assert.deepEqual(draft(withExtras).generator?.rows, [0, 1, 2, 3]);
  const [, , firstDessert, secondDessert] = codes(withExtras);
  assert.ok(firstDessert && secondDessert && firstDessert !== secondDessert, 'two different desserts');

  const setMenu: Dish = {
    ...dish('M1', 'main', 900),
    kind: 'menu',
    course: null,
    menuName: 'Menü 1',
    components: [
      { name: 'Leves', kcal: 300, kind: 'soup', photo: null },
      { name: 'Főétel', kcal: 600, kind: 'main', photo: null },
    ],
  };
  const withSetMenu = { ...context, catalog: [...catalog, setMenu] };
  const actions: PlannerAction[] = [
    { type: 'navigate', step: 'meals' },
    { type: 'addCourse', day: 3, course: 'menu' },
    { type: 'openStage', day: 3, stage: 0 },
    { type: 'pickCourse', day: 3, dish: setMenu },
    { type: 'addCourse', day: 3, course: 'dessert' },
    { type: 'startGenerated', day: 3, seed: 7 },
  ];
  const state = actions.reduce(
    (current, action) => reducePlanner(current, action, withSetMenu),
    initialPlanner({}, newPreferences),
  );
  assert.equal(draft(state).rows[0]?.dish, setMenu, 'the picked menu stays');
  assert.deepEqual(draft(state).generator?.rows, [1]);
  assert.equal(draft(state).rows[1]?.dish?.course, 'dessert');
});

test('an idea fills an empty set-menu row together with the empty extras, within the calorie limit', () => {
  const lightMenu: Dish = {
    ...dish('M1', 'main', 700),
    kind: 'menu',
    course: null,
    menuName: 'Menü 1',
    components: [
      { name: 'Leves', kcal: 200, kind: 'soup', photo: null },
      { name: 'Főétel', kcal: 500, kind: 'main', photo: null },
    ],
  };
  const heavyMenu: Dish = { ...lightMenu, id: '3:1:M2', code: 'M2', kcal: 1050 };
  const withMenus = { ...context, catalog: [...catalog, lightMenu, heavyMenu] };
  const actions: PlannerAction[] = [
    { type: 'navigate', step: 'meals' },
    { type: 'addCourse', day: 3, course: 'menu' },
    { type: 'addCourse', day: 3, course: 'dessert' },
    { type: 'startGenerated', day: 3, seed: 7 },
  ];
  // 1100 kcal: the heavy menu leaves no room for any dessert, so the light one comes with a dessert.
  const state = actions.reduce((current, action) => reducePlanner(current, action, withMenus), initialPlanner({}, limited));
  assert.deepEqual(draft(state).generator?.rows, [0, 1]);
  assert.equal(draft(state).rows[0]?.dish?.code, 'M1');
  assert.ok(draft(state).rows[1]?.dish);

  const cancelled = reducePlanner(state, { type: 'cancelGenerated', day: 3 }, withMenus);
  assert.deepEqual(draft(cancelled).rows, [{ course: 'menu' }, { course: 'dessert' }], 'Vissza empties the rows again');
});

test('a tray of a single row gets no idea, since filling one row is a plain pick', () => {
  const start = run(initialPlanner({}, newPreferences), { type: 'navigate', step: 'meals' });
  const soupOnly = run(start, { type: 'addCourse', day: 3, course: 'soup' });
  assert.equal(run(soupOnly, { type: 'startGenerated', day: 3, seed: 7 }), soupOnly);
  const menuOnly = run(start, { type: 'addCourse', day: 3, course: 'menu' });
  assert.equal(run(menuOnly, { type: 'startGenerated', day: 3, seed: 7 }), menuOnly, 'a set-menu row alone');
  const withDrink = run(soupOnly, { type: 'addCourse', day: 3, course: 'drink' });
  assert.equal(draft(run(withDrink, { type: 'startGenerated', day: 3, seed: 7 })).stage, 'generated');
});

test('an idea fills a set-menu row with a lunch menu, and with a full-day menu only on a day without one', () => {
  const lunchMenu: Dish = {
    ...dish('M1', 'main', 900),
    kind: 'menu',
    course: null,
    menuName: 'Menü 1',
    components: [
      { name: 'Leves', kcal: 300, kind: 'soup', photo: null },
      { name: 'Főétel', kcal: 600, kind: 'main', photo: null },
    ],
  };
  const fullDay: Dish = { ...lunchMenu, id: '3:1:Z10', code: 'Z10', menuName: 'Full Day', kcal: 2000 };
  const ideaWith = (menus: Dish[], seed = 7) => {
    const withMenus = { ...context, catalog: [...catalog, ...menus] };
    const actions: PlannerAction[] = [
      { type: 'navigate', step: 'meals' },
      { type: 'addCourse', day: 3, course: 'menu' },
      { type: 'addCourse', day: 3, course: 'drink' },
      { type: 'startGenerated', day: 3, seed },
    ];
    return actions.reduce((current, action) => reducePlanner(current, action, withMenus), initialPlanner({}, newPreferences));
  };
  for (let seed = 0; seed < 5; seed++) assert.equal(draft(ideaWith([lunchMenu, fullDay], seed)).rows[0]?.dish?.code, 'M1');
  assert.equal(draft(ideaWith([fullDay])).rows[0]?.dish?.code, 'Z10');
});
