import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialPlanner,
  plannerView,
  reducePlanner,
  type PlannerAction,
  type PlannerContext,
  type PlannerState,
} from '../src/core/planner.ts';
import { mealOptions, newPreferences, startPlan } from '../src/core/planning.ts';
import type { CatalogDish, Day, Dish } from '../src/core/types.ts';

// Saturday 21 November 2026 in Budapest: next week (W48) is recommended and W49 is also open.
const now = new Date('2026-11-21T10:00:00Z');
const weeks = [{ key: '2026-W48' }, { key: '2026-W49' }];

function menu(day: Day, code: string): Dish {
  return {
    id: `${day}:1:${code}`,
    day,
    type: 1,
    code,
    kind: 'menu',
    name: `Menu ${code}`,
    price: 1500,
    section: 'Menü',
    groupId: 'Menü',
    category: 'Menü',
    cuisine: null,
    menuName: `Menü ${code}`,
    weekend: false,
    pickerEligible: true,
    course: null,
    kcal: 900,
  };
}
// Teletál already closed Monday and Tuesday, so the orderable days are Wednesday to Sunday.
const catalog: CatalogDish[] = [3, 4, 5].map(day => menu(day, 'P'));
const context: PlannerContext = { weeks, catalog, now };
const pick = (day: Day) => mealOptions([menu(Math.min(day, 5), 'P')], newPreferences, 'lunch')[0];

function run(state: PlannerState, ...actions: PlannerAction[]): PlannerState {
  return actions.reduce((current, action) => reducePlanner(current, action, context), state);
}

test('the week screen recommends next week and opening it starts a plan on the first orderable day', () => {
  const start = initialPlanner(null, newPreferences);
  const view = plannerView(start, context);
  assert.equal(view.week, '2026-W48');
  assert.deepEqual(view.availableDays, [3, 4, 5, 6, 7]);

  const meals = run(start, { type: 'navigate', step: 'meals' });
  assert.equal(meals.step, 'meals');
  assert.equal(meals.plan?.week, '2026-W48');
  assert.equal(plannerView(meals, context).day, 3);
});

test('returning to the week screen and back resumes the same week', () => {
  let state = run(
    initialPlanner(null, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'decide', day: 3, action: 'right', option: pick(3) },
  );
  const planId = state.plan?.id;
  state = run(state, { type: 'navigate', step: 'week' });
  assert.equal(state.selectedWeek, '2026-W48');
  state = run(state, { type: 'navigate', step: 'meals' });
  assert.equal(state.plan?.id, planId);
  assert.equal(state.pendingNewPlan, null);
  assert.equal(plannerView(state, context).day, 4);
});

test('starting another week asks before replacing a plan with progress', () => {
  const started = run(
    initialPlanner(null, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'decide', day: 3, action: 'skip' },
    { type: 'navigate', step: 'week' },
    { type: 'chooseWeek', week: '2026-W49' },
  );
  const asking = run(started, { type: 'navigate', step: 'meals' });
  assert.deepEqual(asking.pendingNewPlan, { week: '2026-W49', step: 'meals' });
  assert.equal(asking.step, 'week');

  const cancelled = run(asking, { type: 'cancelNewPlan' });
  assert.equal(cancelled.pendingNewPlan, null);
  assert.equal(cancelled.plan, started.plan);

  const replaced = run(asking, { type: 'confirmNewPlan' });
  assert.equal(replaced.step, 'meals');
  assert.equal(replaced.plan?.week, '2026-W49');
  assert.deepEqual(replaced.plan?.slots, {});
});

test('a plan without progress is replaced without asking', () => {
  const state = run(
    { ...initialPlanner(startPlan('2026-W48', 3), newPreferences), selectedWeek: '2026-W49' },
    { type: 'navigate', step: 'meals' },
  );
  assert.equal(state.pendingNewPlan, null);
  assert.equal(state.plan?.week, '2026-W49');
});

test('the overview opens after the last orderable day has a decision', () => {
  let state = run(initialPlanner(null, newPreferences), { type: 'navigate', step: 'meals' });
  for (const day of [3, 4, 5, 6]) state = run(state, { type: 'decide', day, action: 'right', option: pick(day) });
  assert.equal(state.step, 'meals');
  state = run(state, { type: 'decide', day: 7, action: 'skip' });
  assert.equal(state.step, 'overview');
  const { order } = plannerView(state, context);
  assert.deepEqual(
    order?.lines.map(({ day, code, quantity }) => [day, code, quantity]),
    [
      [3, 'P', 1],
      [4, 'P', 1],
      [5, 'P', 2],
    ],
  );
});

test('a finished day opens from the overview and is replaced only when the user confirms', () => {
  let state = run(
    initialPlanner(null, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'decide', day: 3, action: 'right', option: pick(3) },
    { type: 'navigate', step: 'overview' },
    { type: 'openDay', day: 3 },
  );
  assert.equal(state.step, 'meals');
  assert.equal(plannerView(state, context).dayDone, true);

  state = run(state, { type: 'openDay', day: 3, edit: true });
  const editing = plannerView(state, context);
  assert.equal(editing.editing, true);
  assert.equal(editing.dayDone, false);
  state = run(state, { type: 'decide', day: 3, action: 'left', option: pick(3) });
  assert.equal(state.plan?.slots[3]?.id, pick(3).id);

  state = run(state, { type: 'decide', day: 3, action: 'skip' });
  assert.equal(state.plan?.slots[3], null);
  assert.equal(state.editingDay, null);
});

test('Vissza targets: the meal picker returns to the week screen and the overview reopens the first day', () => {
  let state = run(
    initialPlanner(null, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'decide', day: 3, action: 'skip' },
    { type: 'decide', day: 4, action: 'skip' },
    { type: 'navigate', step: 'overview' },
  );
  state = run(state, { type: 'navigate', step: 'meals' });
  assert.equal(plannerView(state, context).day, 3);
  assert.equal(run(state, { type: 'navigate', step: 'week' }).step, 'week');
});

test('decisions for a day that is no longer current or orderable are ignored', () => {
  const state = run(initialPlanner(null, newPreferences), { type: 'navigate', step: 'meals' });
  assert.equal(run(state, { type: 'decide', day: 4, action: 'skip' }), state);
  const late = { ...context, now: new Date('2026-11-24T23:30:00Z') };
  assert.equal(reducePlanner(state, { type: 'decide', day: 3, action: 'skip' }, late).plan?.day, 3);
  assert.equal(run(state, { type: 'decide', day: 3, action: 'right' }), state);
});

test('day choices apply to the plan of the same week and are kept per week otherwise', () => {
  let state = run(
    initialPlanner(null, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'navigate', step: 'week' },
    { type: 'setWeekDays', days: [3, 5] },
  );
  assert.deepEqual(state.plan?.selectedDays, [3, 5]);
  state = run(state, { type: 'chooseWeek', week: '2026-W49' }, { type: 'setWeekDays', days: [1, 2] });
  assert.deepEqual(state.weekDays['2026-W49'], [1, 2]);
  assert.deepEqual(state.plan?.selectedDays, [3, 5]);
  assert.deepEqual(plannerView(state, context).selectedDays, [1, 2]);
});

test('resetting the week keeps its day choices and clears its decisions', () => {
  const state = run(
    initialPlanner(null, newPreferences),
    { type: 'navigate', step: 'meals' },
    { type: 'decide', day: 3, action: 'skip' },
    { type: 'navigate', step: 'week' },
    { type: 'setWeekDays', days: [3, 4] },
    { type: 'resetWeek' },
  );
  assert.deepEqual(state.plan?.slots, {});
  assert.deepEqual(state.plan?.selectedDays, [3, 4]);
  assert.equal(plannerView(state, context).hasSavedProgress, false);
});
