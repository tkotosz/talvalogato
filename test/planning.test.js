import assert from 'node:assert/strict';
import test from 'node:test';
import { calorieLimit, cartLines, choose, dayQueue, mealOptions, restorePlan, sourceDay, startPlan } from '../src/planning.js';
import { dayLabel, defaultWeek, mondayOfWeek, weekLabel } from '../src/weeks.js';

const settings = { week: '2026-W48', calories: 1000, tolerance: 5 };
const soup = { id: '5:1:A1', day: 5, code: 'A1', kind: 'soup', name: 'Soup', kcal: 247, price: 700 };
const main = { id: '5:1:M', day: 5, code: 'M', kind: 'main', name: 'Main', kcal: 600, price: 1500 };
const dessert = { id: '5:1:T', day: 5, code: 'T', kind: 'dessert', name: 'Dessert', kcal: 200, price: 650 };
const side = { name: 'Pickled peppers', kind: 'side', kcal: 30 };
const menu = { id: '5:1:P', day: 5, code: 'P', kind: 'menu', name: 'Set menu', kcal: 877, price: 1600, components: [soup, { ...main, kcal: 630 }] };
const menuWithDessert = { ...menu, id: '5:1:Q', code: 'Q', kcal: 875, components: [soup, { ...main, kcal: 428 }, dessert] };
const overBudget = { id: '5:1:O', day: 5, code: 'O', kind: 'main', name: 'Over budget', kcal: 1050.1, price: 1700 };
const dishes = [soup, main, dessert, menu, menuWithDessert, overBudget];

test('merchant menus, custom combinations, and singles rank in that order within the calorie limit', () => {
  assert.equal(calorieLimit(settings), 1050);
  const options = mealOptions(dishes, settings);
  assert.deepEqual(options.map(option => [option.kind, option.kcal]), [
    ['menuWithDessert', 875], ['menu', 877], ['triple', 1047], ['pair', 847], ['single', 600], ['single', 247],
  ]);
  assert.deepEqual(options[0].dishes, [menuWithDessert]);
  assert.deepEqual(options[1].dishes, [menu]);
  assert.deepEqual(options[2].dishes, [soup, main, dessert]);
  assert.equal(options[2].price, 2850);
  assert.deepEqual(mealOptions(dishes, { ...settings, tolerance: 0 }).map(option => option.kcal), [875, 877, 847, 600, 247]);
});

test('the deck respects enabled types and orders each type by its distance to the target', () => {
  const otherDessert = { ...dessert, id: '5:1:T2', code: 'T2', kcal: 150 };
  const mainWithDessert = { ...menu, id: '5:1:ZR7', components: [main, dessert] };
  const options = mealOptions([...dishes, otherDessert, mainWithDessert], { ...settings, types: ['triple', 'menu'] });
  assert.deepEqual(options.map(option => [option.kind, option.kcal]), [['menu', 877], ['triple', 997], ['triple', 1047]]);
  assert.deepEqual(mealOptions(dishes, { ...settings, types: [] }), []);
});

test('the first menu filter includes a separately listed side or fruit as a third course', () => {
  const menuWithSide = { ...menu, id: '5:1:R', code: 'R', components: [soup, main, side] };
  const menuWithFruit = { ...menu, id: '5:1:SU1', code: 'SU1', components: [soup, main, { name: 'Apple', kcal: 30 }] };
  const menuWithoutSoup = { ...menu, id: '5:1:SU2', code: 'SU2', components: [main, dessert, side] };
  const menus = [menu, menuWithDessert, menuWithSide, menuWithFruit, menuWithoutSoup];
  const options = mealOptions(menus, { ...settings, types: ['menuWithDessert'] });
  assert.deepEqual(options.map(option => option.dishes[0].code).sort(), ['Q', 'R', 'SU1']);
  assert.deepEqual(mealOptions(menus, { ...settings, types: ['menu'] }).map(option => option.dishes[0].code), ['P']);
});

test('maybe cycles to the back, pass removes, and restart clears a day’s decisions', () => {
  const options = mealOptions(dishes, settings);
  const plan = startPlan(settings);
  const deferred = choose(plan, 'up', options[0]);
  assert.deepEqual(dayQueue(options, deferred), [...options.slice(1), options[0]]);
  const passed = choose(deferred, 'left', options[0]);
  assert.deepEqual(dayQueue(options, passed), options.slice(1));
  assert.deepEqual(dayQueue(options, choose(passed, 'restart')), options);
  assert.equal(choose(passed, 'skip').slots[1], null);
});

test('switching days retains separate swipe history, including the active day of older plans', () => {
  const options = mealOptions(dishes, settings);
  const savedPlan = { id: 'legacy', settings, day: 1, slots: {}, excluded: [options[0].id], deferred: [] };
  let plan = restorePlan(savedPlan);
  assert.deepEqual(dayQueue(options, plan), options.slice(1));
  plan = { ...plan, day: 3 };
  assert.deepEqual(dayQueue(options, plan), options);
  plan = choose(plan, 'up', options[0]);
  assert.deepEqual(dayQueue(options, { ...plan, day: 1 }), options.slice(1));
  assert.deepEqual(dayQueue(options, plan), [...options.slice(1), options[0]]);
});

test('finishing days out of order finds the next unfinished day and editing clears only that day', () => {
  const options = mealOptions(dishes, settings);
  let plan = choose({ ...startPlan(settings), day: 3 }, 'right', options[0]);
  assert.equal(plan.day, 4);
  for (const expectedDay of [5, 6, 7, 1, 2, 8]) {
    plan = choose(plan, 'skip');
    assert.equal(plan.day, expectedDay);
  }
  const editing = choose({ ...plan, day: 3 }, 'restart');
  assert.equal(Object.hasOwn(editing.slots, 3), false);
  assert.equal(Object.keys(editing.slots).length, 6);
  assert.deepEqual(dayQueue(options, editing), options);
  const changed = choose(editing, 'right', options[1]);
  assert.equal(changed.day, 8);
  assert.deepEqual(changed.slots, { ...plan.slots, 3: options[1] });
});

test('the cart groups Friday, Saturday, and Sunday choices into Friday portions', () => {
  const triple = mealOptions([soup, main, dessert], settings)[0];
  let plan = { ...startPlan(settings), day: 5 };
  for (const day of [5, 6, 7]) {
    assert.equal(sourceDay(day), 5);
    plan = choose(plan, 'right', triple);
  }
  assert.deepEqual(cartLines(plan), [
    { day: 5, code: 'A1', name: 'Soup', quantity: 3 },
    { day: 5, code: 'M', name: 'Main', quantity: 3 },
    { day: 5, code: 'T', name: 'Dessert', quantity: 3 },
  ]);
});

test('the next Budapest delivery week handles an ISO-year boundary', () => {
  const weeks = [{ key: '2026-W53' }, { key: '2027-W01' }];
  assert.equal(defaultWeek(weeks, new Date('2026-12-30T16:00:00Z')), '2027-W01');
  assert.equal(mondayOfWeek('2027-W01').toISOString(), '2027-01-04T00:00:00.000Z');
  assert.equal(mondayOfWeek('2027-W53'), null);
});

test('day and week labels use Hungarian dates, including weeks across two months', () => {
  assert.equal(dayLabel('2026-W48', 1), 'november 23.');
  assert.equal(weekLabel('2026-W48'), 'nov. 23–29.');
  assert.equal(weekLabel('2026-W49').replace(/\s+/g, ' '), 'nov. 30. – dec. 6.');
});
