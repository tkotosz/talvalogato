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
const catalog = [
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

test('a custom day starts with soup and main ticked, then moves through the courses to the side-course step', () => {
  let state = customDay();
  assert.deepEqual(draft(state).mealCourses, ['soup', 'main']);
  assert.equal(draft(state).stage, 'meals');

  state = run(state, { type: 'setMealCourses', day: 3, courses: ['main', 'soup'] });
  assert.equal(draft(state).stage, 'soup');
  state = run(state, { type: 'pickCourse', day: 3, dish: soup });
  assert.equal(draft(state).stage, 'main');
  state = run(state, { type: 'pickCourse', day: 3, dish: main });
  assert.equal(draft(state).stage, 'sides');

  state = run(state, { type: 'setSideCourses', day: 3, courses: ['dessert', 'pickle'] });
  assert.equal(draft(state).stage, 'pickle');
  state = run(state, { type: 'pickCourse', day: 3, dish: pickle }, { type: 'pickCourse', day: 3, dish: dessert });

  const saved = state.plan!.slots[3]!;
  assert.equal(saved.kind, 'custom');
  assert.deepEqual(
    saved.dishes.map(item => item.code),
    ['A1', 'I1', 'W1', 'S1'],
  );
  assert.equal(saved.price, 800 + 2000 + 350 + 1000);
  assert.equal(saved.kcal, 1430);
  assert.equal(state.plan!.custom[3], undefined);
  assert.equal(plannerView(state, context).day, 4);
});

test('the meal checklist is remembered, and no side courses saves the day straight away', () => {
  let state = customDay();
  state = run(state, { type: 'setMealCourses', day: 3, courses: ['breakfast', 'main'] });
  assert.deepEqual(state.preferences.mealCourses, ['breakfast', 'main']);
  assert.deepEqual(restorePreferences(JSON.parse(JSON.stringify(state.preferences))).mealCourses, ['breakfast', 'main']);
  state = run(
    state,
    { type: 'skipCourse', day: 3 },
    { type: 'pickCourse', day: 3, dish: main },
    { type: 'setSideCourses', day: 3, courses: [] },
  );
  assert.deepEqual(state.plan!.slots[3]!.dishes, [main]);
  assert.deepEqual(state.plan!.slots[3]!.custom, { mealCourses: ['breakfast', 'main'], sideCourses: [], overLimit: false });
});

test('skipping every course skips the day, and the side-course step still appears', () => {
  let state = run(customDay(), { type: 'setMealCourses', day: 3, courses: ['soup'] }, { type: 'skipCourse', day: 3 });
  assert.equal(draft(state).stage, 'sides');
  state = run(state, { type: 'setSideCourses', day: 3, courses: ['drink'] }, { type: 'skipCourse', day: 3 });
  assert.equal(state.plan!.slots[3], null);
  assert.equal(state.plan!.custom[3], undefined);
});

test('reopening an earlier course replaces its dish and continues from there; the draft survives other days', () => {
  let state = run(
    customDay(),
    { type: 'setMealCourses', day: 3, courses: ['soup', 'main'] },
    { type: 'pickCourse', day: 3, dish: soup },
  );
  state = run(state, { type: 'openStage', day: 3, stage: 'soup' }, { type: 'pickCourse', day: 3, dish: bigSoup });
  assert.equal(draft(state).picks.soup, bigSoup);
  assert.equal(draft(state).stage, 'main');

  state = run(state, { type: 'openDay', day: 4 }, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3 });
  assert.equal(plannerView(state, context).custom?.picks.soup, bigSoup);
  assert.equal(run(state, { type: 'openStage', day: 3, stage: 'drink' }), state, 'a course that was not chosen cannot be opened');
});

test('a calorie limit offers only dishes that fit what is left, hides unknown calories, and lets the user go over', () => {
  let state = run(
    customDay(limited),
    { type: 'setMealCourses', day: 3, courses: ['soup', 'main'] },
    { type: 'pickCourse', day: 3, dish: bigSoup },
  );
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
  state = run(
    state,
    { type: 'pickCourse', day: 3, dish: main },
    { type: 'setSideCourses', day: 3, courses: ['dessert', 'drink'] },
  );
  assert.deepEqual(courseDeck(catalog, 'dessert', draft(state), limited).options, []);
  assert.deepEqual(courseDeck(catalog, 'drink', draft(state), limited).options, [], 'drinks without calorie data are hidden');
  state = run(state, { type: 'skipCourse', day: 3 }, { type: 'skipCourse', day: 3 });

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

test('dishes that fit come first in Teletál order, and code exclusions apply to every course', () => {
  const state = run(customDay(limited), { type: 'setMealCourses', day: 3, courses: ['soup'] });
  const withOver = { ...draft(state), overLimit: ['dessert' as const] };
  const picked = { ...withOver, picks: { soup: dish('A9', 'soup', 800) } };
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

test('editing a custom day restores its courses, and the saved day stays until the edit is saved', () => {
  let state = run(
    customDay(),
    { type: 'setMealCourses', day: 3, courses: ['soup', 'main'] },
    { type: 'pickCourse', day: 3, dish: soup },
    { type: 'skipCourse', day: 3 },
    { type: 'setSideCourses', day: 3, courses: ['pickle'] },
    { type: 'pickCourse', day: 3, dish: pickle },
  );
  const saved = state.plan!.slots[3]!;

  state = run(state, { type: 'navigate', step: 'overview' }, { type: 'openDay', day: 3, edit: true });
  const editing = draft(state);
  assert.equal(editing.stage, 'summary');
  assert.deepEqual(editing.picks, { soup, main: null, pickle });

  state = run(state, { type: 'openStage', day: 3, stage: 'main' }, { type: 'pickCourse', day: 3, dish: main });
  assert.equal(draft(state).stage, 'summary');
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
    { mealCourses: ['soup'], sideCourses: ['drink'], stage: 'drink', picks: { soup, drink }, overLimit: [], editing: false },
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
  const state = run(
    customDay(),
    { type: 'setMealCourses', day: 3, courses: ['soup'] },
    { type: 'decide', day: 3, action: 'skip' },
  );
  assert.equal(state.plan!.slots[3], null);
  assert.equal(state.plan!.custom[3], undefined);
});
