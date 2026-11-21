import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calorieLimit, cartLines, choose, dayCandidates, dayQueue, mealOptions, newPreferences, orderSummary, restorePlan, restorePreferences, startPlan,
} from '../src/planning.js';
import { dayLabel, defaultWeek, eligibleDays, mondayOfWeek, sourceDay, upcomingWeeks, weekLabel } from '../src/weeks.js';

const week = '2026-W48';
const allDays = [1, 2, 3, 4, 5, 6, 7];
const preferences = { ...newPreferences, limitCalories: true, calories: 1000, tolerance: 5 };
const soup = { id: '5:1:A1', day: 5, code: 'A1', kind: 'soup', name: 'Soup', kcal: 247, price: 700 };
const main = { id: '5:1:M', day: 5, code: 'M', kind: 'main', name: 'Main', kcal: 600, price: 1500 };
const dessert = { id: '5:1:T', day: 5, code: 'T', kind: 'dessert', name: 'Dessert', kcal: 200, price: 650 };
const side = { name: 'Pickled peppers', kind: 'side', kcal: 30 };
const menu = { id: '5:1:P', day: 5, code: 'P', kind: 'menu', name: 'Set menu', kcal: 877, price: 1600, components: [soup, { ...main, kcal: 630 }] };
const menuWithDessert = { ...menu, id: '5:1:Q', code: 'Q', kcal: 875, components: [soup, { ...main, kcal: 428 }, dessert] };
const fullDay = ['Z10', 'Z11', 'IRN'].map(code => ({ ...menu, id: '5:1:' + code, code, kcal: 1600, components: [{ name: 'Lunch' }, { name: 'Dinner' }] }));
const ir = { ...menu, id: '5:1:IR', code: 'IR', kcal: 980, components: [{ name: 'Lunch' }, { name: 'Dinner' }] };
const dishes = [soup, main, dessert, menu, menuWithDessert, ...fullDay, ir];

test('lunch and full-day decks contain separate Teletál menus', () => {
  assert.deepEqual(mealOptions(dishes, newPreferences, 'lunch').map(option => option.dishes[0].code), ['P', 'Q', 'IR']);
  assert.deepEqual(mealOptions(dishes, newPreferences, 'fullDay').map(option => option.dishes[0].code), ['Z10', 'Z11', 'IRN']);
  const menuWithSide = { ...menu, id: '5:1:R', code: 'R', components: [soup, main, side] };
  const menuWithoutSoup = { ...menu, id: '5:1:SU2', code: 'SU2', components: [main, dessert, side] };
  assert.deepEqual(mealOptions([menuWithSide, menuWithoutSoup], newPreferences, 'lunch').map(option => option.dishes[0].code), ['R']);
});

test('an enabled limit filters whole menus, ranks by the target, and distinguishes zero and unknown calories', () => {
  const unknown = { ...menu, id: '5:1:PN', code: 'PN', kcal: null, components: undefined };
  const zero = { ...menu, id: '5:1:R', code: 'R', kcal: 0 };
  const over = { ...menu, id: '5:1:O', code: 'O', kcal: 1050.1 };
  assert.equal(calorieLimit(preferences), 1050);
  assert.deepEqual(mealOptions([...dishes, unknown, zero, over], preferences, 'lunch').map(option => option.kcal), [980, 877, 875, 0]);
  assert.deepEqual(mealOptions([unknown, zero, over], newPreferences, 'lunch').map(option => option.kcal), [null, 0, 1050.1]);
  assert.deepEqual(mealOptions(fullDay, preferences, 'fullDay'), []);
});

test('code exclusions apply to either deck only while filtering is on', () => {
  const filtered = { ...newPreferences, filterCodes: true, excludedCodes: ['P', 'IRN'] };
  assert.deepEqual(mealOptions(dishes, filtered, 'lunch').map(option => option.dishes[0].code), ['Q', 'IR']);
  assert.deepEqual(mealOptions(dishes, filtered, 'fullDay').map(option => option.dishes[0].code), ['Z10', 'Z11']);
  assert.equal(mealOptions(dishes, { ...filtered, filterCodes: false }, 'fullDay').length, 3);
});

test('restoring a legacy plan keeps choices and swipe history, with preferences saved independently', () => {
  const option = mealOptions(dishes, newPreferences, 'lunch')[0];
  const saved = { id: 'legacy', settings: { week, calories: 1000, tolerance: 5, excludedCodes: ['q'] },
    day: 2, slots: { 1: option }, excluded: [option.id], deferred: [] };
  const plan = restorePlan(saved);
  assert.equal(plan.week, week);
  assert.deepEqual(plan.slots, { 1: option });
  assert.deepEqual(dayQueue([option], plan), []);
  assert.deepEqual(dayQueue([option], { ...plan, day: 3 }), [option]);
  assert.deepEqual(restorePreferences(null, saved.settings), { ...preferences, filterCodes: true, excludedCodes: ['Q'] });
  assert.deepEqual(restorePreferences({ ...newPreferences, excludedCodes: ['P'] }, saved.settings),
    { ...newPreferences, excludedCodes: ['P'] });
  assert.equal(restorePlan({ ...saved, day: 8 }).day, null);
});

test('weekly day choices and default days are restored independently in calendar order', () => {
  const plan = startPlan(week, 2, [7, 2, 2, 8]);
  assert.deepEqual(restorePlan(plan).selectedDays, [2, 7]);
  assert.deepEqual(restorePlan({ ...plan, selectedDays: undefined }).selectedDays, allDays);
  assert.deepEqual(restorePlan({ ...plan, selectedDays: [] }).selectedDays, []);
  assert.deepEqual(restorePreferences({ defaultDays: [6, 1, 0, 6] }).defaultDays, [1, 6]);
  assert.deepEqual(restorePreferences({}).defaultDays, allDays);
  assert.deepEqual(restorePreferences({ defaultDays: [] }).defaultDays, []);
});

test('swipe history survives deck switches and restarting the deck preserves a saved pick', () => {
  const options = mealOptions(dishes, newPreferences, 'lunch');
  const plan = { ...startPlan(week, 1), slots: { 1: options[1] } };
  const deferred = choose(plan, 'up', options[0], allDays);
  assert.deepEqual(dayQueue(options, deferred), [...options.slice(1), options[0]]);
  const passed = choose(deferred, 'left', options[0], allDays);
  assert.deepEqual(dayQueue(options, passed), options.slice(1));
  assert.equal(dayQueue(mealOptions(dishes, newPreferences, 'fullDay'), passed).length, 3);
  const reset = choose(passed, 'restart', null, allDays);
  assert.deepEqual(dayQueue(options, reset), options);
  assert.equal(reset.slots[1], options[1]);
  assert.equal(choose(reset, 'skip', null, allDays).slots[1], null);
});

test('advancing wraps to unfinished eligible days and editing a finished plan returns to review', () => {
  const eligible = [3, 5, 6];
  const option = mealOptions(dishes, newPreferences, 'lunch')[0];
  let plan = choose(startPlan(week, 5), 'right', option, eligible);
  assert.equal(plan.day, 6);
  plan = choose(plan, 'skip', null, eligible);
  assert.equal(plan.day, 3);
  plan = choose(plan, 'skip', null, eligible);
  assert.equal(plan.day, null);
  const replacement = mealOptions(fullDay, newPreferences, 'fullDay')[0];
  const edited = choose({ ...plan, day: 5 }, 'right', replacement, eligible);
  assert.deepEqual(edited.slots, { 3: null, 5: replacement, 6: null });
  assert.equal(edited.day, null);
});

test('cart quantities use Friday for weekend plans and conflicts preserve picks', () => {
  const option = mealOptions([menu], newPreferences, 'lunch')[0];
  const thursday = [soup, main, dessert].map(dish => ({ ...dish, id: dish.id.replace(/^5/, '4'), day: 4 }));
  const olderCombo = { kind: 'generated', dishes: thursday, kcal: 1047, price: 2850 };
  const plan = { ...startPlan(week, 5), slots: { 4: olderCombo, 5: option, 6: option, 7: option } };
  for (const day of [5, 6, 7]) assert.equal(sourceDay(day), 5);
  assert.deepEqual(cartLines({ slots: { 5: option, 6: option, 7: option } }), [{ day: 5, code: 'P', name: 'Set menu', quantity: 3 }]);
  const current = orderSummary(plan, [5, 6, 7], [...dishes, ...thursday], newPreferences);
  assert.deepEqual(current.issues, { 4: 'Már nem rendelhető' });
  assert.equal(current.lines[0].quantity, 3);
  assert.deepEqual(orderSummary({ ...plan, slots: { 4: { ...olderCombo, dishes: [soup] } } }, [4], dishes, newPreferences).issues,
    { 4: 'Már nem rendelhető' });
  const excluded = orderSummary(plan, [4, 5, 6, 7], [...dishes, ...thursday], { ...preferences, filterCodes: true, excludedCodes: ['P'] });
  assert.deepEqual(excluded.issues, { 5: 'Kizárt Teletál-kód', 6: 'Kizárt Teletál-kód', 7: 'Kizárt Teletál-kód' });
  assert.equal(excluded.total, olderCombo.price);
  assert.equal(plan.slots[5], option);
  assert.deepEqual(orderSummary(plan, [5, 6, 7], [], newPreferences).lines, []);
});

test('weekend days use the weekend lines Teletál publishes and Friday lines for the rest', () => {
  const saturdayZ10 = { ...fullDay[0], id: '6:1:Z10', day: 6, name: 'Saturday full day' };
  const saturdayIr = { ...ir, id: '6:1:IR', day: 6 };
  const catalog = [...dishes, saturdayZ10, saturdayIr];
  assert.deepEqual(dayCandidates(catalog, 5), dishes);
  assert.deepEqual(dayCandidates(catalog, 6).map(dish => dish.id),
    ['5:1:A1', '5:1:M', '5:1:T', '5:1:P', '5:1:Q', '5:1:Z11', '5:1:IRN', '6:1:Z10', '6:1:IR']);
  assert.deepEqual(dayCandidates(catalog, 7), dishes);

  const fridayPick = mealOptions([fullDay[0]], newPreferences, 'fullDay')[0];
  const saturdayPick = mealOptions([saturdayZ10], newPreferences, 'fullDay')[0];
  const plan = { ...startPlan(week, 5), slots: { 5: fridayPick, 6: saturdayPick, 7: fridayPick } };
  const order = orderSummary(plan, [5, 6, 7], catalog, newPreferences);
  assert.deepEqual(order.issues, {});
  assert.deepEqual(order.lines.map(({ day, code, quantity }) => [day, code, quantity]), [[5, 'Z10', 2], [6, 'Z10', 1]]);
  const savedBeforeWeekendLines = orderSummary({ ...plan, slots: { 6: fridayPick } }, [5, 6, 7], catalog, newPreferences);
  assert.deepEqual(savedBeforeWeekendLines.issues, { 6: 'Már nem rendelhető' });
});

test('deselected days are omitted from cart quantities without removing their saved meals', () => {
  const option = mealOptions([menu], newPreferences, 'lunch')[0];
  const plan = { ...startPlan(week, 5, [5, 7]), slots: { 5: option, 6: option, 7: option } };
  const order = orderSummary(plan, [5, 6, 7], dishes, newPreferences);
  assert.deepEqual(order.lines, [{ day: 5, code: 'P', name: 'Set menu', quantity: 2 }]);
  assert.equal(order.total, option.price * 2);
  assert.deepEqual(order.issues, {});
  assert.equal(plan.slots[6], option);
  assert.equal(orderSummary({ ...plan, selectedDays: allDays }, [5, 6, 7], dishes, newPreferences).lines[0].quantity, 3);
});

test('days respect the Budapest date, provider availability, and the Friday weekend cutoff', () => {
  assert.deepEqual(eligibleDays(week, new Date('2026-11-22T18:00:00Z')), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(eligibleDays(week, new Date('2026-11-24T23:30:00Z')), [5, 6, 7]);
  assert.deepEqual(eligibleDays(week, new Date('2026-11-24T23:30:00Z'), new Set([4])), []);
  assert.deepEqual(eligibleDays(week, new Date('2026-11-26T08:00:00Z')), []);
  assert.deepEqual(eligibleDays(week, new Date('2026-11-22T18:00:00Z'), new Set([2, 4])), [2, 4]);
});

test('the next Budapest delivery week handles an ISO-year boundary and falls back to an eligible published week', () => {
  const now = new Date('2026-12-30T16:00:00Z');
  const weeks = [{ key: '2027-W02' }, { key: '2026-W53' }, { key: '2027-W01' }, { key: '2026-W52' }];
  assert.deepEqual(upcomingWeeks(weeks, now).map(({ key }) => key), ['2026-W53', '2027-W01', '2027-W02']);
  assert.equal(defaultWeek(weeks, now), '2027-W01');
  assert.equal(defaultWeek(weeks.filter(({ key }) => key !== '2027-W01'), now), '2026-W53');
  assert.equal(mondayOfWeek('2027-W01').toISOString(), '2027-01-04T00:00:00.000Z');
  assert.equal(mondayOfWeek('2027-W53'), null);
});

test('the current week disappears when its Friday delivery passes the Budapest ordering cutoff', () => {
  const weeks = [{ key: week }, { key: '2026-W49' }];
  const before = new Date('2026-11-25T22:59:59Z');
  const after = new Date('2026-11-25T23:00:00Z');
  assert.deepEqual(upcomingWeeks(weeks, before), weeks);
  assert.deepEqual(upcomingWeeks(weeks, after), [weeks[1]]);
  assert.equal(defaultWeek(weeks, after), '2026-W49');
  assert.equal(defaultWeek([weeks[0]], after), '');
});

test('day and week labels use Hungarian dates, including weeks across two months', () => {
  assert.equal(dayLabel(week, 1), 'november 23.');
  assert.equal(weekLabel(week), 'nov. 23–29.');
  assert.equal(weekLabel('2026-W49').replace(/\s+/g, ' '), 'nov. 30. – dec. 6.');
});
