import assert from 'node:assert/strict';
import test from 'node:test';
import { calorieLimit, cartLines, choose, dayQueue, mealOptions, sourceDay, startPlan } from '../src/planning.js';
import { defaultWeek, mondayOfWeek } from '../src/weeks.js';

const settings = { week: '2026-W48', calories: 1000, tolerance: 5 };
const soup = { id: '5:1:A1', day: 5, code: 'A1', kind: 'soup', name: 'Soup', kcal: 247, price: 700 };
const main = { id: '5:1:M', day: 5, code: 'M', kind: 'main', name: 'Main', kcal: 800, price: 1500 };
const menu = { id: '5:1:P', day: 5, code: 'P', kind: 'menu', name: 'Set menu', kcal: 1049, price: 1600 };
const overBudget = { id: '5:1:O', day: 5, code: 'O', kind: 'main', name: 'Over budget', kcal: 1050.1, price: 1700 };

test('tolerance applies to single dishes, soup-and-main combinations, and set menus', () => {
  assert.equal(calorieLimit(settings), 1050);
  const options = mealOptions([soup, main, menu, overBudget], settings);
  assert.deepEqual(options.map(option => [option.kind, option.kcal]), [
    ['pair', 1047], ['menu', 1049], ['single', 800], ['single', 247],
  ]);
  assert.deepEqual(options[0].dishes, [soup, main]);
  assert.deepEqual(options[1].dishes, [menu]);
  assert.deepEqual(mealOptions([soup, main, menu, overBudget], { ...settings, tolerance: 0 }).map(option => option.kcal), [800, 247]);
});

test('maybe cycles to the back, pass removes, and restart clears a day’s decisions', () => {
  const options = mealOptions([soup, main, menu], settings);
  const plan = startPlan(settings);
  const deferred = choose(plan, 'up', options[0]);
  assert.deepEqual(dayQueue(options, deferred), [...options.slice(1), options[0]]);
  const passed = choose(deferred, 'left', options[0]);
  assert.deepEqual(dayQueue(options, passed), options.slice(1));
  assert.deepEqual(dayQueue(options, choose(passed, 'restart')), options);
  assert.equal(choose(passed, 'skip').slots[1], null);
});

test('the cart groups Friday, Saturday, and Sunday choices into Friday portions', () => {
  const pair = mealOptions([soup, main], settings)[0];
  let plan = { ...startPlan(settings), day: 5 };
  for (const day of [5, 6, 7]) {
    assert.equal(sourceDay(day), 5);
    plan = choose(plan, 'right', pair);
  }
  assert.deepEqual(cartLines(plan), [
    { day: 5, code: 'A1', name: 'Soup', quantity: 3 },
    { day: 5, code: 'M', name: 'Main', quantity: 3 },
  ]);
});

test('the next Budapest delivery week handles an ISO-year boundary', () => {
  const weeks = [{ key: '2026-W53' }, { key: '2027-W01' }];
  assert.equal(defaultWeek(weeks, new Date('2026-12-30T16:00:00Z')), '2027-W01');
  assert.equal(mondayOfWeek('2027-W01').toISOString(), '2027-01-04T00:00:00.000Z');
  assert.equal(mondayOfWeek('2027-W53'), null);
});
