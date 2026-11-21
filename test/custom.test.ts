import assert from 'node:assert/strict';
import test from 'node:test';
import { courseDeck, customOption, totalCalories } from '../src/core/custom.ts';
import {
  initialPlanner,
  plannerView,
  reducePlanner,
  type PlannerAction,
  type PlannerContext,
  type PlannerState,
} from '../src/core/planner.ts';
import { cartLines, newPreferences, orderSummary, restorePreferences } from '../src/core/planning.ts';
import type { CustomCourse, Day, Dish, Preferences } from '../src/core/types.ts';

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
const catalog = [
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
function customDay(preferences: Preferences = newPreferences): PlannerState {
  return run(initialPlanner(null, preferences), { type: 'navigate', step: 'meals' }, { type: 'startCustom', day: 3 });
}
const draft = (state: PlannerState) => state.plan!.custom[3]!;
const pick = (dish: Dish): PlannerAction[] => [
  { type: 'openStage', day: 3, stage: dish.course! },
  { type: 'pickCourse', day: 3, dish },
];

test('a custom day starts with the component selection, soup and main ticked, then shows the menu overview', () => {
  let state = customDay();
  assert.deepEqual(draft(state).courses, ['soup', 'main']);
  assert.equal(draft(state).stage, 'select');

  state = run(state, { type: 'setCourses', day: 3, courses: ['dessert', 'main', 'soup', 'cold'] });
  assert.deepEqual(draft(state).courses, ['soup', 'main', 'cold', 'dessert']);
  assert.equal(draft(state).stage, 'overview');
  assert.deepEqual(state.preferences.customCourses, ['soup', 'main', 'cold', 'dessert']);
  assert.deepEqual(restorePreferences(JSON.parse(JSON.stringify(state.preferences))).customCourses, [
    'soup',
    'main',
    'cold',
    'dessert',
  ]);
});

test('picking a dish for a component returns to the overview, and the day is only saved with Mentés', () => {
  let state = run(customDay(), { type: 'setCourses', day: 3, courses: ['soup', 'main', 'cold'] });
  state = run(state, { type: 'openStage', day: 3, stage: 'main' });
  assert.equal(draft(state).stage, 'main');
  state = run(state, { type: 'pickCourse', day: 3, dish: main });
  assert.equal(draft(state).stage, 'overview');
  state = run(state, ...pick(soup), ...pick(salad));
  assert.ok(!Object.hasOwn(state.plan!.slots, 3), 'nothing is saved before Mentés');

  state = run(state, { type: 'saveCustom', day: 3 });
  const saved = state.plan!.slots[3]!;
  assert.equal(saved.kind, 'custom');
  assert.deepEqual(
    saved.dishes.map(item => item.code),
    ['A1', 'I1', 'D1'],
  );
  assert.equal(saved.price, 800 + 2000 + 1500);
  assert.equal(saved.kcal, 1350);
  assert.equal(state.plan!.custom[3], undefined);
  assert.equal(plannerView(state, context).day, 3, 'the saved day stays open');
  assert.equal(plannerView(state, context).dayDone, true);
});

test('Nem kérek clears a component, and a menu without any dish cannot be saved', () => {
  let state = run(customDay(), { type: 'setCourses', day: 3, courses: ['soup'] }, ...pick(soup));
  state = run(state, { type: 'openStage', day: 3, stage: 'soup' }, { type: 'clearCourse', day: 3 });
  assert.deepEqual(draft(state).picks, {});
  assert.equal(draft(state).stage, 'overview');
  assert.equal(run(state, { type: 'saveCustom', day: 3 }), state);
});

test('changing the components keeps the dishes of the ones still chosen; only chosen components can be opened', () => {
  let state = run(customDay(), { type: 'setCourses', day: 3, courses: ['soup', 'main'] }, ...pick(soup), ...pick(main));
  state = run(state, { type: 'openStage', day: 3, stage: 'select' }, { type: 'setCourses', day: 3, courses: ['main', 'pickle'] });
  assert.deepEqual(draft(state).picks, { main });
  assert.equal(run(state, { type: 'openStage', day: 3, stage: 'drink' }), state);

  state = run(state, { type: 'openDay', day: 4 }, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3 });
  assert.deepEqual(plannerView(state, context).custom?.picks, { main }, 'the draft survives other days');
});

test('a calorie limit offers only dishes that fit what is left, hides unknown calories, and lets the user go over', () => {
  let state = run(
    customDay(limited),
    { type: 'setCourses', day: 3, courses: ['soup', 'main', 'dessert', 'drink'] },
    ...pick(bigSoup),
  );
  state = run(state, { type: 'openStage', day: 3, stage: 'main' });
  const mains = courseDeck(catalog, 'main', draft(state), limited);
  assert.equal(mains.remaining, 600);
  assert.deepEqual(mains.options, []);
  assert.equal(mains.overLimitCount, 2);
  assert.equal(run(state, { type: 'pickCourse', day: 3, dish: main }), state, 'an over-limit dish cannot be picked unasked');

  state = run(state, { type: 'showOverLimit', day: 3 });
  assert.deepEqual(
    courseDeck(catalog, 'main', draft(state), limited).options.map(option => option.id),
    [main.id, bigMain.id],
  );
  state = run(state, { type: 'pickCourse', day: 3, dish: main });
  assert.deepEqual(courseDeck(catalog, 'dessert', draft(state), limited).options, []);
  assert.deepEqual(courseDeck(catalog, 'drink', draft(state), limited).options, [], 'drinks without calorie data are hidden');
  state = run(state, { type: 'saveCustom', day: 3 });

  const saved = state.plan!.slots[3]!;
  assert.equal(saved.kcal, 1200);
  assert.equal(saved.custom?.overLimit, true);
  const order = orderSummary(state.plan!, [3, 4, 5, 6, 7], catalog, limited);
  assert.deepEqual(order.issues, {});
  assert.deepEqual(
    order.lines.map(({ day, code }) => `${day}:${code}`),
    ['3:A2', '3:I1'],
  );
});

test('dishes that fit come first, smallest overshoot next, and code exclusions apply to every component', () => {
  const state = run(customDay(limited), { type: 'setCourses', day: 3, courses: ['soup', 'dessert'] });
  const picked = { ...draft(state), overLimit: ['dessert' as const], picks: { soup: dish('A9', 'soup', 800) } };
  assert.deepEqual(
    courseDeck(catalog, 'dessert', picked, limited).options.map(option => option.dishes[0]!.code),
    ['S2', 'S1'],
  );
  const excluding = { ...newPreferences, filterCodes: true, excludedCodes: ['A1'] };
  assert.deepEqual(
    courseDeck(catalog, 'soup', draft(state), excluding).options.map(option => option.dishes[0]!.code),
    ['A2'],
  );
  assert.deepEqual(
    courseDeck(catalog, 'drink', draft(state), newPreferences).options.map(option => option.kcal),
    [null],
  );
});

test('editing a custom day restores its components on the overview, and the saved day stays until the edit is saved', () => {
  let state = run(
    customDay(),
    { type: 'setCourses', day: 3, courses: ['soup', 'main', 'pickle'] },
    ...pick(soup),
    ...pick(pickle),
  );
  state = run(state, { type: 'saveCustom', day: 3 });
  const saved = state.plan!.slots[3]!;

  state = run(state, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3, edit: true });
  assert.equal(draft(state).stage, 'overview');
  assert.deepEqual(draft(state).courses, ['soup', 'main', 'pickle']);
  assert.deepEqual(draft(state).picks, { soup, pickle });

  state = run(state, ...pick(main));
  assert.equal(state.plan!.slots[3], saved);
  state = run(state, { type: 'saveCustom', day: 3 });
  assert.deepEqual(
    state.plan!.slots[3]!.dishes.map(item => item.code),
    ['A1', 'I1', 'W1'],
  );
  assert.equal(state.plan!.custom[3], undefined);
  assert.equal(state.editingDay, null);
});

test('custom days send each dish as its own cart line, and totals stay unknown when a dish lacks calories', () => {
  const option = customOption(
    { courses: ['soup', 'drink'], stage: 'overview', picks: { soup, drink }, overLimit: [] },
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

test('skipping the whole day ends a custom day in progress', () => {
  const state = run(customDay(), { type: 'setCourses', day: 3, courses: ['soup'] }, { type: 'decide', day: 3, action: 'skip' });
  assert.equal(state.plan!.slots[3], null);
  assert.equal(state.plan!.custom[3], undefined);
});
