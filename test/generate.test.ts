import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMenu, generationProblem, nextRandom, startGenerator } from '../src/core/generate.ts';
import {
  initialPlanner,
  plannerView,
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
function generatedDay(preferences: Preferences = newPreferences, seed = 7): PlannerState {
  return run(initialPlanner({}, preferences), { type: 'navigate', step: 'meals' }, { type: 'startGenerated', day: 3, seed });
}
const draft = (state: PlannerState) => state.plans[w48]!.custom[3]!;
const codes = (state: PlannerState) => Object.values(draft(state).picks).map(dish => dish.code);
const total = (picks: Partial<Record<CustomCourse, Dish>>) => Object.values(picks).reduce((sum, item) => sum + item.kcal!, 0);

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

test('a generated menu has one dish for each chosen course that has dishes', () => {
  const { picks } = generateMenu(catalog, ['soup', 'main', 'cold'], newPreferences, startGenerator(1));
  assert.deepEqual(Object.keys(picks).sort(), ['main', 'soup']);
  assert.equal(picks.soup!.course, 'soup');
  assert.equal(picks.main!.course, 'main');
});

test('every dish is offered once before any dish comes back', () => {
  let generator = startGenerator(3);
  const offered: string[] = [];
  for (let round = 0; round < mains.length; round++) {
    const next = generateMenu(catalog, ['main'], newPreferences, generator);
    offered.push(next.picks.main!.code);
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
    assert.equal(next.picks.drink, undefined, 'a drink without calories cannot count toward the limit');
    assert.ok(next.picks.soup && next.picks.main && next.picks.dessert);
    assert.ok(total(next.picks) <= limit, `${total(next.picks)} kcal fits ${limit}`);
    mainsOffered.add(next.picks.main.code);
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
  assert.deepEqual(generateMenu(catalog, ['soup', 'main', 'dessert'], tight, startGenerator(1)).picks, {});
  const excluded = { ...newPreferences, filterCodes: true, excludedCodes: ['I1', 'I2', 'I3', 'I4'] };
  assert.deepEqual(Object.keys(generateMenu(catalog, ['soup', 'main'], excluded, startGenerator(1)).picks), ['soup']);
});

test('a generated day starts with the component selection and then shows a whole menu', () => {
  let state = generatedDay();
  assert.equal(draft(state).stage, 'select');
  assert.deepEqual(draft(state).courses, ['soup', 'main']);

  state = run(state, { type: 'setCourses', day: 3, courses: ['soup', 'main', 'dessert'] });
  assert.equal(draft(state).stage, 'generated');
  assert.equal(codes(state).length, 3);
  assert.deepEqual(state.preferences.customCourses, ['soup', 'main', 'dessert']);
  // Generated days have no overview and no component decks.
  assert.equal(run(state, { type: 'openStage', day: 3, stage: 'overview' }), state);
  assert.equal(run(state, { type: 'openStage', day: 3, stage: 'main' }), state);
  assert.equal(run(state, { type: 'clearCourse', day: 3 }), state);
});

test('the same seed generates the same menus, so tests and a reload agree', () => {
  const first = run(generatedDay(newPreferences, 5), { type: 'setCourses', day: 3, courses: ['soup', 'main'] });
  const again = run(generatedDay(newPreferences, 5), { type: 'setCourses', day: 3, courses: ['soup', 'main'] });
  assert.deepEqual(codes(first), codes(again));
  const restored = JSON.parse(JSON.stringify(first)) as PlannerState;
  assert.deepEqual(
    codes(run(restored, { type: 'rejectGenerated', day: 3 })),
    codes(run(first, { type: 'rejectGenerated', day: 3 })),
  );
});

test('rejecting a menu brings a different main until every main was offered', () => {
  let state = run(generatedDay(), { type: 'setCourses', day: 3, courses: ['main'] });
  const offered = [codes(state)[0]];
  for (let round = 1; round < mains.length; round++) {
    state = run(state, { type: 'rejectGenerated', day: 3 });
    offered.push(codes(state)[0]);
  }
  assert.equal(new Set(offered).size, mains.length);
  assert.equal(state.plans[w48]!.slots[3], undefined, 'rejecting does not decide the day');
});

test('accepting a menu saves it as a custom day and moves on to the next day', () => {
  let state = run(generatedDay(), { type: 'setCourses', day: 3, courses: ['soup', 'main'] });
  const picked = codes(state);
  state = run(state, { type: 'acceptGenerated', day: 3 });
  const saved = state.plans[w48]!.slots[3]!;
  assert.equal(saved.kind, 'custom');
  assert.deepEqual(saved.dishes.map(item => item.code).sort(), [...picked].sort());
  assert.deepEqual(saved.custom, { courses: ['soup', 'main'], overLimit: false });
  assert.equal(state.plans[w48]!.custom[3], undefined);
  assert.equal(plannerView(state, context).day, 4);
  assert.deepEqual(
    orderSummary(state.plans[w48]!, [3, 4, 5], catalog, newPreferences).lines.map(line => line.code),
    [...picked].sort(),
  );

  // Editing it opens the usual custom-day overview with the generated dishes.
  state = run(state, { type: 'openDay', day: 3, edit: true });
  assert.equal(draft(state).stage, 'overview');
  assert.equal(draft(state).generator, undefined);
});

test('a menu that no longer fits the settings is replaced instead of accepted', () => {
  let state = run(generatedDay(), { type: 'setCourses', day: 3, courses: ['main'] });
  const shown = codes(state)[0]!;
  state = run(state, {
    type: 'savePreferences',
    preferences: { ...state.preferences, filterCodes: true, excludedCodes: [shown] },
  });
  state = run(state, { type: 'acceptGenerated', day: 3 });
  assert.equal(state.plans[w48]!.slots[3], undefined);
  assert.notEqual(codes(state)[0], shown);
});

test('changing the components of a generated day generates a new menu for them', () => {
  let state = run(generatedDay(), { type: 'setCourses', day: 3, courses: ['soup', 'main'] });
  state = run(state, { type: 'openStage', day: 3, stage: 'select' }, { type: 'setCourses', day: 3, courses: ['dessert'] });
  assert.equal(draft(state).stage, 'generated');
  assert.deepEqual(Object.keys(draft(state).picks), ['dessert']);
});

test('a day with nothing to generate shows the generated stage without a menu', () => {
  const state = run(generatedDay(), { type: 'setCourses', day: 3, courses: ['cold'] });
  assert.equal(draft(state).stage, 'generated');
  assert.deepEqual(draft(state).picks, {});
  assert.equal(run(state, { type: 'acceptGenerated', day: 3 }), state);
});
