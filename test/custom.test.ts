import assert from 'node:assert/strict';
import test from 'node:test';
import {
  courseDeck,
  customOption,
  dishOption,
  emptyTray,
  rowChoiceCounts,
  totalCalories,
  trayCourses,
  withCourse,
} from '../src/core/custom.ts';
import {
  initialPlanner,
  plannerView,
  reducePlanner,
  type PlannerAction,
  type PlannerContext,
  type PlannerState,
} from '../src/core/planner.ts';
import { cartLines, newPreferences, orderSummary, restorePlan } from '../src/core/planning.ts';
import type { Allergen, CustomCourse, CustomDraft, Day, Dish, Preferences } from '../src/core/types.ts';

/** The week the tests plan. */
const w48 = '2026-W48';
// Saturday 21 November 2026: next week's Wednesday (day 3) is the first orderable day.
const now = new Date('2026-11-21T10:00:00Z');
const weeks = [{ key: '2026-W48' }];

function dish(code: string, course: CustomCourse, kcal: number | null, day: Day = 3, price = 1000): Dish {
  return {
    id: `${day}:1:${code}`,
    day,
    type: 1,
    code,
    kind: course === 'soup' ? 'soup' : course === 'dessert' ? 'dessert' : 'main',
    name: `${code} dish`,
    price,
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

const soup = dish('A1', 'soup', 300, 3, 800);
const bigSoup = dish('A2', 'soup', 500);
const main = dish('I1', 'main', 700, 3, 2000);
const bigMain = dish('I2', 'main', 1400);
const pickle = dish('W1', 'pickle', 30, 3, 350);
const dessert = dish('S1', 'dessert', 400);
const lightDessert = dish('S2', 'dessert', 60);
const drink = dish('NF1', 'drink', null, 3, 199);
const salad = dish('D1', 'cold', 350, 3, 1500);
// A Teletál set menu: soup and main as one line, without a course of its own.
const setMenu: Dish = {
  ...dish('M1', 'main', 900),
  kind: 'menu',
  course: null,
  name: 'Leves / Főétel',
  menuName: 'Menü 1',
  components: [
    { name: 'Leves', kcal: 300, kind: 'soup', photo: null },
    { name: 'Főétel', kcal: 600, kind: 'main', photo: null },
  ],
};
// A whole-day Teletál menu, which a set-menu row offers next to the lunch menus.
const fullDayMenu: Dish = {
  ...setMenu,
  id: '3:1:Z10',
  code: 'Z10',
  name: 'Reggeli / Ebéd / Vacsora',
  menuName: 'Full Day',
  kcal: 1050,
};
const catalog = [
  setMenu,
  fullDayMenu,
  salad,
  soup,
  bigSoup,
  main,
  bigMain,
  pickle,
  dessert,
  lightDessert,
  drink,
  ...[4, 5].map(day => dish('A1', 'soup', 300, day)),
];
const context: PlannerContext = { weeks, catalog, now };
const limited: Preferences = { ...newPreferences, limitCalories: true, calories: 1000, tolerance: 10 };

function run(state: PlannerState, ...actions: PlannerAction[]): PlannerState {
  return actions.reduce((current, action) => reducePlanner(current, action, context), state);
}
/** A tray with a soup and a main row, the usual start of a day built course by course. */
function customDay(preferences: Preferences = newPreferences): PlannerState {
  return run(
    initialPlanner({}, preferences),
    { type: 'navigate', step: 'meals' },
    { type: 'addCourse', day: 3, course: 'soup' },
    { type: 'addCourse', day: 3, course: 'main' },
  );
}
const draft = (state: PlannerState) => state.plans[w48]!.custom[3]!;
const courses = (state: PlannerState) => draft(state).rows.map(row => row.course);
const dishes = (state: PlannerState) => draft(state).rows.map(row => row.dish?.code ?? null);

/** Picks `dish` into the first empty row it fits, adding a row when the tray has none. */
function pickDish(state: PlannerState, dish: Dish): PlannerState {
  const course = dish.course ?? 'menu';
  const emptyRow = () => draft(state).rows.findIndex(row => row.course === course && !row.dish);
  if (!state.plans[w48]?.custom[3] || emptyRow() < 0) state = run(state, { type: 'addCourse', day: 3, course });
  return run(state, { type: 'openStage', day: 3, stage: emptyRow() }, { type: 'pickCourse', day: 3, dish });
}
const pickAll = (state: PlannerState, ...picked: Dish[]) => picked.reduce(pickDish, state);
const meals = () => run(initialPlanner({}, newPreferences), { type: 'navigate', step: 'meals' });

test('a day opens on an empty tray, its first row starts it, and rows keep tray order with breakfast first', () => {
  let state = meals();
  assert.equal(plannerView(state, context).custom, null);
  state = run(
    state,
    { type: 'addCourse', day: 3, course: 'soup' },
    { type: 'addCourse', day: 3, course: 'menu' },
    { type: 'addCourse', day: 3, course: 'breakfast' },
    { type: 'addCourse', day: 3, course: 'menu' },
  );
  assert.deepEqual(courses(state), ['breakfast', 'menu', 'menu', 'soup']);
  assert.equal(draft(state).stage, 'overview', 'adding a row does not open it');
  assert.deepEqual(trayCourses, ['breakfast', 'menu', 'soup', 'main', 'cold', 'pickle', 'bread', 'dessert', 'drink']);
});

test('a kind of row can be on the tray any number of times, and the same dish twice is a cart quantity of two', () => {
  let state = run(customDay(), { type: 'addCourse', day: 3, course: 'drink' }, { type: 'addCourse', day: 3, course: 'drink' });
  state = run(state, { type: 'addCourse', day: 3, course: 'main' });
  assert.deepEqual(courses(state), ['soup', 'main', 'main', 'drink', 'drink']);
  state = pickAll(state, main, bigMain, drink, drink);
  state = run(state, { type: 'navigate', step: 'overview' });
  const saved = state.plans[w48]!.slots[3]!;
  assert.deepEqual(saved.custom?.courses, ['soup', 'main', 'main', 'drink', 'drink']);
  assert.deepEqual(
    cartLines({ slots: { 3: saved } }).map(({ code, quantity }) => [code, quantity]),
    [
      ['I1', 1],
      ['I2', 1],
      ['NF1', 2],
    ],
  );
  // Editing restores every row, the empty soup included.
  state = run(state, { type: 'openDay', day: 3, edit: true });
  assert.deepEqual(dishes(state), [null, 'I1', 'I2', 'NF1', 'NF1']);
});

test('picking dishes returns to the tray, and the day is saved when the user leaves it', () => {
  let state = pickAll(customDay(), main, soup, salad);
  assert.ok(!Object.hasOwn(state.plans[w48]!.slots, 3), 'nothing is saved while the day is open');

  state = run(state, { type: 'navigate', step: 'overview' });
  const saved = state.plans[w48]!.slots[3]!;
  assert.equal(saved.kind, 'custom');
  assert.equal(saved.title, 'Saját menü');
  assert.deepEqual(
    saved.dishes.map(item => item.code),
    ['A1', 'I1', 'D1'],
  );
  assert.equal(saved.price, 800 + 2000 + 1500);
  assert.equal(saved.kcal, 1350);
  assert.equal(state.plans[w48]!.custom[3], undefined);
  state = run(state, { type: 'openDay', day: 3 });
  assert.equal(plannerView(state, context).dayDone, true, 'the saved day reopens finished');
});

test('Kész saves the tray and shows the finished day, and does nothing without dishes', () => {
  let state = customDay();
  assert.equal(run(state, { type: 'saveTray', day: 3 }), state, 'a tray of empty rows saves nothing');
  state = run(pickAll(state, soup), { type: 'saveTray', day: 3 });
  assert.deepEqual(
    state.plans[w48]!.slots[3]!.dishes.map(item => item.code),
    ['A1'],
  );
  assert.equal(plannerView(state, context).day, 3, 'the saved day stays open');
  assert.equal(plannerView(state, context).dayDone, true);
});

test('moving to another day saves the tray, leaving out empty rows and an idea not kept yet', () => {
  let state = pickAll(customDay(), soup);
  state = run(state, { type: 'startGenerated', day: 3, seed: 1 });
  assert.equal(draft(state).stage, 'generated', 'an idea is waiting to be kept');
  state = run(state, { type: 'openDay', day: 4 });
  const saved = state.plans[w48]!.slots[3]!;
  assert.deepEqual(
    saved.dishes.map(item => item.code),
    ['A1'],
  );
  assert.deepEqual(saved.custom?.courses, ['soup', 'main']);
  assert.equal(plannerView(state, context).day, 4);
});

test('clearing the tray of a saved day leaves the day without a decision', () => {
  let state = run(pickAll(customDay(), soup), { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3, edit: true });
  state = run(state, { type: 'clearDay', day: 3 });
  assert.equal(plannerView(state, context).custom, null, 'the tray is empty');
  state = run(state, { type: 'navigate', step: 'overview' });
  assert.ok(!Object.hasOwn(state.plans[w48]!.slots, 3));

  state = run(state, { type: 'openDay', day: 3 }, { type: 'addCourse', day: 3, course: 'soup' });
  state = run(state, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3 });
  assert.equal(plannerView(state, context).dayDone, false, 'a tray of empty rows decides nothing');
});

test('Nem kérek and emptying keep a row, removing takes it off, and a tray without dishes saves nothing', () => {
  let state = pickAll(customDay(), soup, pickle);
  state = run(state, { type: 'openStage', day: 3, stage: 0 }, { type: 'clearCourse', day: 3 });
  assert.deepEqual(dishes(state), [null, null, 'W1']);
  state = run(state, { type: 'emptyCourse', day: 3, row: 2 });
  assert.deepEqual(dishes(state), [null, null, null], 'emptied rows stay');
  state = run(state, { type: 'removeCourse', day: 3, row: 2 });
  assert.deepEqual(courses(state), ['soup', 'main']);
  assert.equal(run(state, { type: 'removeCourse', day: 3, row: 5 }), state, 'only rows on the tray can be removed');
  assert.ok(
    !Object.hasOwn(run(state, { type: 'navigate', step: 'overview' }).plans[w48]!.slots, 3),
    'a tray without dishes saves nothing',
  );

  state = run(state, { type: 'openDay', day: 4 }, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3 });
  assert.deepEqual(
    plannerView(state, context).custom?.rows,
    [{ course: 'soup' }, { course: 'main' }],
    'the tray survives other days',
  );
});

test('a set-menu row offers lunch and full-day menus; a menu alone is saved as the menu, with extras as one day', () => {
  let state = run(meals(), { type: 'addCourse', day: 3, course: 'menu' });
  assert.deepEqual(
    courseDeck(catalog, draft(state), 0, newPreferences).options.map(option => option.id),
    [setMenu.id, fullDayMenu.id],
  );
  state = run(state, { type: 'openStage', day: 3, stage: 0 }, { type: 'pickCourse', day: 3, dish: setMenu });
  state = run(state, { type: 'navigate', step: 'overview' });
  assert.deepEqual(state.plans[w48]!.slots[3], dishOption(setMenu));

  state = run(state, { type: 'openDay', day: 3, edit: true });
  assert.deepEqual(draft(state).rows, [{ course: 'menu', dish: setMenu }]);
  state = run(pickDish(state, pickle), { type: 'navigate', step: 'overview' });
  const saved = state.plans[w48]!.slots[3]!;
  assert.equal(saved.kind, 'custom');
  assert.equal(saved.title, 'Menü 1 kiegészítőkkel');
  assert.equal(saved.kcal, 930);
  assert.deepEqual(
    cartLines({ slots: { 3: saved } }).map(({ code, quantity }) => [code, quantity]),
    [
      ['M1', 1],
      ['W1', 1],
    ],
  );
});

test('set menus sit next to anything, two menus are a plain combined day, and a row takes only what fits it', () => {
  let state = pickAll(customDay(), soup, setMenu, fullDayMenu);
  assert.deepEqual(courses(state), ['menu', 'menu', 'soup', 'main']);
  const menuRow = draft(state).rows.findIndex(row => row.course === 'menu');
  state = run(state, { type: 'emptyCourse', day: 3, row: menuRow }, { type: 'openStage', day: 3, stage: menuRow });
  assert.equal(run(state, { type: 'pickCourse', day: 3, dish: main }), state, 'a main is not a set menu');
  const soupRow = draft(state).rows.findIndex(row => row.course === 'soup');
  const onSoup = run(state, { type: 'openStage', day: 3, stage: soupRow });
  assert.equal(run(onSoup, { type: 'pickCourse', day: 3, dish: setMenu }), onSoup, 'a set menu is not a soup');

  state = run(state, { type: 'pickCourse', day: 3, dish: setMenu }, { type: 'navigate', step: 'overview' });
  assert.equal(state.plans[w48]!.slots[3]!.title, 'Saját menü', 'two set menus have no single name');
});

test('with a calorie limit the set menu that fills what is left best comes first', () => {
  const lightMenu: Dish = { ...setMenu, id: '3:1:M3', code: 'M3', kcal: 600 };
  const limitedMenus = [setMenu, fullDayMenu, lightMenu];
  const tray = withCourse(emptyTray(), 'menu');
  assert.deepEqual(
    courseDeck(limitedMenus, tray, 0, limited).options.map(option => option.dishes[0]!.code),
    ['Z10', 'M1', 'M3'],
  );
});

test('trays saved in earlier shapes open as rows, a set menu after any breakfast', () => {
  const plan = restorePlan({
    id: 'p',
    week: w48,
    custom: {
      3: { courses: ['soup', 'cold'], stage: 'select', picks: { soup }, overLimit: [] },
      4: { courses: ['breakfast', 'main'], stage: 'main', picks: {}, overLimit: [], menu: setMenu, menuRow: 'lunch' },
      5: { rows: [{ course: 'pickle' }], stage: 'menu', menuRow: 'fullDay', overLimit: [] },
      6: { courses: ['soup'], stage: 'generated', picks: {}, overLimit: [], generator: { seed: 1, shown: {} } },
    } as never,
  });
  assert.deepEqual(plan.custom, {
    3: { rows: [{ course: 'soup', dish: soup }, { course: 'cold' }], stage: 'overview', overLimit: [] },
    4: { rows: [{ course: 'breakfast' }, { course: 'menu', dish: setMenu }, { course: 'main' }], stage: 2, overLimit: [] },
    5: { rows: [{ course: 'pickle' }], stage: 0, overLimit: [] },
  });
});

test('a calorie limit offers only dishes that fit what is left, hides unknown calories, and lets the user go over', () => {
  let state = pickDish(customDay(limited), bigSoup);
  state = run(state, { type: 'openStage', day: 3, stage: 1 });
  const mains = courseDeck(catalog, draft(state), 1, limited);
  assert.equal(mains.remaining, 600);
  assert.deepEqual(mains.options, []);
  assert.equal(mains.overLimitCount, 2);
  assert.equal(run(state, { type: 'pickCourse', day: 3, dish: main }), state, 'an over-limit dish cannot be picked unasked');

  state = run(state, { type: 'showOverLimit', day: 3 });
  assert.deepEqual(
    courseDeck(catalog, draft(state), 1, limited).options.map(option => option.id),
    [main.id, bigMain.id],
  );
  state = run(state, { type: 'pickCourse', day: 3, dish: main }, { type: 'addCourse', day: 3, course: 'dessert' });
  state = run(state, { type: 'addCourse', day: 3, course: 'drink' });
  assert.deepEqual(courseDeck(catalog, draft(state), 2, limited).options, []);
  assert.deepEqual(courseDeck(catalog, draft(state), 3, limited).options, [], 'drinks without calorie data are hidden');
  state = run(state, { type: 'navigate', step: 'overview' });

  const saved = state.plans[w48]!.slots[3]!;
  assert.equal(saved.kcal, 1200);
  assert.equal(saved.custom?.overLimit, true);
  const order = orderSummary(state.plans[w48]!, [3, 4, 5, 6, 7], catalog, limited);
  assert.deepEqual(order.issues, {});
  assert.deepEqual(
    order.lines.map(({ day, code }) => `${day}:${code}`),
    ['3:A2', '3:I1'],
  );
});

test('dishes that fit come first, smallest overshoot next, and code exclusions apply to every row', () => {
  const tray = { ...emptyTray(), overLimit: ['dessert' as const] };
  const withSoup: CustomDraft = { ...tray, rows: [{ course: 'soup', dish: dish('A9', 'soup', 800) }, { course: 'dessert' }] };
  assert.deepEqual(
    courseDeck(catalog, withSoup, 1, limited).options.map(option => option.dishes[0]!.code),
    ['S2', 'S1'],
  );
  const excluding = { ...newPreferences, filterCodes: true, excludedCodes: ['A1'] };
  assert.deepEqual(
    courseDeck(catalog, withCourse(tray, 'soup'), 0, excluding).options.map(option => option.dishes[0]!.code),
    ['A2'],
  );
  assert.deepEqual(
    courseDeck(catalog, withCourse(tray, 'drink'), 0, newPreferences).options.map(option => option.kcal),
    [null],
  );
});

test('editing a saved day puts its dishes back on the tray, and the saved day stays until the user leaves the day', () => {
  let state = run(pickAll(customDay(), soup, pickle), { type: 'navigate', step: 'overview' });
  const saved = state.plans[w48]!.slots[3]!;

  state = run(state, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3, edit: true });
  assert.equal(draft(state).stage, 'overview');
  assert.deepEqual(draft(state).rows, [{ course: 'soup', dish: soup }, { course: 'main' }, { course: 'pickle', dish: pickle }]);

  state = pickDish(state, main);
  assert.equal(state.plans[w48]!.slots[3], saved);
  state = run(state, { type: 'navigate', step: 'overview' });
  assert.deepEqual(
    state.plans[w48]!.slots[3]!.dishes.map(item => item.code),
    ['A1', 'I1', 'W1'],
  );
  assert.equal(state.plans[w48]!.custom[3], undefined);
  assert.equal(state.editingDay, null);
});

test('custom days send each dish as its own cart line, and totals stay unknown when a dish lacks calories', () => {
  const option = customOption(
    {
      rows: [
        { course: 'soup', dish: soup },
        { course: 'drink', dish: drink },
      ],
      stage: 'overview',
      overLimit: [],
    },
    newPreferences,
  )!;
  assert.equal(option.kcal, null);
  assert.equal(totalCalories([soup, pickle]), 330);
  assert.deepEqual(
    cartLines({ slots: { 3: option, 4: option } }).map(({ code, quantity }) => [code, quantity]),
    [
      ['A1', 2],
      ['NF1', 2],
    ],
  );
});

test('skipping the whole day ends a tray in progress', () => {
  const state = run(customDay(), { type: 'decide', day: 3, action: 'skip' });
  assert.equal(state.plans[w48]!.slots[3], null);
  assert.equal(state.plans[w48]!.custom[3], undefined);
});

test('a row leaves out filtered dishes, and a dish the current data marks with an excluded allergen cannot be picked', () => {
  const noMilk: Preferences = { ...newPreferences, filterAllergens: true, excludedAllergens: ['milk'] };
  const labeled = (item: Dish, allergens: Allergen[] | null): Dish => ({
    ...item,
    components: [{ name: item.name, kcal: item.kcal ?? 0, photo: null, allergens, ingredients: null }],
  });
  const current = catalog.map(item => labeled(item, item.code === 'I1' ? ['milk'] : item.code === 'I2' ? null : []));
  assert.deepEqual(
    courseDeck(current, draft(customDay(noMilk)), 1, noMilk).options.map(option => option.dishes[0]?.code),
    [],
    'milk and unknown allergens both leave the deck',
  );

  const state = run(customDay(noMilk), { type: 'openStage', day: 3, stage: 1 });
  const withCurrent = (action: PlannerAction) => reducePlanner(state, action, { ...context, catalog: current });
  // The dish as the user's card had it claims no allergens; the current data says milk.
  assert.equal(withCurrent({ type: 'pickCourse', day: 3, dish: labeled(main, []) }), state);
});

test('each kind of row counts its choices under the settings, and what the day offers at all', () => {
  const day3 = catalog.filter(item => item.day === 3);
  const { allowed, available } = rowChoiceCounts(day3, { ...newPreferences, diet: 'vegan' });
  assert.deepEqual(available, { breakfast: 0, menu: 2, soup: 2, main: 2, cold: 1, pickle: 1, bread: 0, dessert: 2, drink: 1 });
  assert.deepEqual(allowed, { breakfast: 0, menu: 0, soup: 0, main: 0, cold: 0, pickle: 0, bread: 0, dessert: 0, drink: 0 });
});
