import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cartLines,
  choose,
  dayCandidates,
  dayQueue,
  menuDeck,
  newPreferences,
  orderSummary,
  restorePlan,
  restorePlans,
  restorePreferences,
  menuCourseNames,
  splitDishName,
  startPlan,
  withDetails,
} from '../src/core/planning.ts';
import { dishOption } from '../src/core/custom.ts';
import type { Course, CourseKind, Dish, MenuDeckId, MenuOption } from '../src/core/types.ts';
import {
  dayLabel,
  defaultWeek,
  eligibleDays,
  mondayOfWeek,
  sourceDay,
  upcomingWeeks,
  weekOptionLabel,
} from '../src/core/weeks.ts';

const week = '2026-W48';
const allDays = [1, 2, 3, 4, 5, 6, 7];
const preferences = { ...newPreferences, limitCalories: true, calories: 1000, tolerance: 5 };

function dish(fields: Partial<Dish> & Pick<Dish, 'id' | 'code' | 'name' | 'price'>): Dish {
  return {
    day: 5,
    type: 1,
    kind: 'main',
    kcal: null,
    section: '',
    groupId: '',
    category: '',
    cuisine: null,
    menuName: fields.name,
    weekend: false,
    pickerEligible: true,
    ...fields,
    course: fields.course !== undefined ? fields.course : fields.kind === 'menu' ? null : (fields.kind ?? 'main'),
  };
}
const course = (kind: CourseKind | undefined, name: string, kcal: number): Course => ({ kind, name, kcal, photo: null });

const soup = dish({ id: '5:1:A1', code: 'A1', kind: 'soup', name: 'Soup', kcal: 247, price: 700 });
const main = dish({ id: '5:1:M', code: 'M', kind: 'main', name: 'Main', kcal: 600, price: 1500 });
const dessert = dish({ id: '5:1:T', code: 'T', kind: 'dessert', name: 'Dessert', kcal: 200, price: 650 });
const soupCourse = course('soup', 'Soup', 247);
const sideCourse = course('side', 'Pickled peppers', 30);
const menu = dish({
  id: '5:1:P',
  code: 'P',
  kind: 'menu',
  name: 'Set menu',
  kcal: 877,
  price: 1600,
  components: [soupCourse, course('main', 'Main', 630)],
});
const menuWithDessert = {
  ...menu,
  id: '5:1:Q',
  code: 'Q',
  kcal: 875,
  components: [soupCourse, course('main', 'Main', 428), course('dessert', 'Dessert', 200)],
};
const twoMeals = [course(undefined, 'Lunch', 800), course(undefined, 'Dinner', 800)];
const fullDay = ['Z10', 'Z11', 'IRN'].map(code => ({ ...menu, id: '5:1:' + code, code, kcal: 1600, components: twoMeals }));
const ir = { ...menu, id: '5:1:IR', code: 'IR', kcal: 980, components: twoMeals };
const dishes = [soup, main, dessert, menu, menuWithDessert, ...fullDay, ir];

/** The cards of a Teletál menu deck, as the tray's set-menu rows offer them. */
const options = (list: Dish[], deck: MenuDeckId) => list.filter(dish => menuDeck(dish) === deck).map(dishOption);

test('Teletál menus are lunch or full-day menus, and a menu without soup and main is neither', () => {
  assert.deepEqual(
    options(dishes, 'lunch').map(option => option.dishes[0].code),
    ['P', 'Q', 'IR'],
  );
  assert.deepEqual(
    options(dishes, 'fullDay').map(option => option.dishes[0].code),
    ['Z10', 'Z11', 'IRN'],
  );
  const menuWithSide = { ...menu, id: '5:1:R', code: 'R', components: [soupCourse, course('main', 'Main', 600), sideCourse] };
  const menuWithoutSoup = {
    ...menu,
    id: '5:1:SU2',
    code: 'SU2',
    components: [course('main', 'Main', 600), course('dessert', 'Dessert', 200), sideCourse],
  };
  assert.deepEqual(
    options([menuWithSide, menuWithoutSoup], 'lunch').map(option => option.dishes[0].code),
    ['R'],
  );
});

test('restoring a saved plan keeps choices and swipe history, and preferences are validated separately', () => {
  const option = options(dishes, 'lunch')[0];
  const saved = { ...startPlan(week, 2), slots: { 1: option }, drafts: { 2: { excluded: [option.id], deferred: [] } } };
  const stored = JSON.parse(JSON.stringify(saved));
  const plan = restorePlan(stored);
  assert.deepEqual(plan, stored);
  assert.deepEqual(dayQueue([option], plan), []);
  assert.deepEqual(dayQueue([option], { ...plan, day: 3 }), [option]);
  assert.equal(restorePlan({ ...saved, day: 8 }).day, null);
  assert.deepEqual(restorePlan({ id: 'partial', week }), {
    id: 'partial',
    week,
    day: null,
    selectedDays: allDays,
    slots: {},
    drafts: {},
    custom: {},
  });

  assert.deepEqual(restorePreferences(null), newPreferences);
  assert.deepEqual(restorePreferences({ ...preferences, filterCodes: true, excludedCodes: ['q', 'q', 'not a code', 7] }), {
    ...preferences,
    filterCodes: true,
    excludedCodes: ['Q'],
  });
  assert.deepEqual(restorePreferences({ ...preferences, calories: 0 }), { ...newPreferences, limitCalories: false });
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
  const lunch = options(dishes, 'lunch');
  const plan = { ...startPlan(week, 1), slots: { 1: lunch[1] } };
  const deferred = choose(plan, 'up', lunch[0], allDays);
  assert.deepEqual(dayQueue(lunch, deferred), [...lunch.slice(1), lunch[0]]);
  const passed = choose(deferred, 'left', lunch[0], allDays);
  assert.deepEqual(dayQueue(lunch, passed), lunch.slice(1));
  assert.equal(dayQueue(options(dishes, 'fullDay'), passed).length, 3);
  const reset = choose(passed, 'restart', null, allDays);
  assert.deepEqual(dayQueue(lunch, reset), lunch);
  assert.equal(reset.slots[1], lunch[1]);
  assert.equal(choose(reset, 'skip', null, allDays).slots[1], null);
});

test('advancing wraps to unfinished eligible days and editing a finished plan returns to review', () => {
  const eligible = [3, 5, 6];
  const option = options(dishes, 'lunch')[0];
  let plan = choose(startPlan(week, 5), 'right', option, eligible);
  assert.equal(plan.day, 6);
  plan = choose(plan, 'skip', null, eligible);
  assert.equal(plan.day, 3);
  plan = choose(plan, 'skip', null, eligible);
  assert.equal(plan.day, null);
  const replacement = options(fullDay, 'fullDay')[0];
  const edited = choose({ ...plan, day: 5 }, 'right', replacement, eligible);
  assert.deepEqual(edited.slots, { 3: null, 5: replacement, 6: null });
  assert.equal(edited.day, null);
});

test('cart quantities use Friday for weekend plans and conflicts preserve picks', () => {
  const option = options([menu], 'lunch')[0];
  const thursday = [soup, main, dessert].map(dish => ({ ...dish, id: dish.id.replace(/^5/, '4'), day: 4 }));
  const olderCombo: MenuOption = { id: 'combo', kind: 'menu', title: 'Combo', dishes: thursday, kcal: 1047, price: 2850 };
  const plan = { ...startPlan(week, 5), slots: { 4: olderCombo, 5: option, 6: option, 7: option } };
  for (const day of [5, 6, 7]) assert.equal(sourceDay(day), 5);
  assert.deepEqual(cartLines({ slots: { 5: option, 6: option, 7: option } }), [
    { day: 5, code: 'P', name: 'Set menu', quantity: 3 },
  ]);
  const current = orderSummary(plan, [5, 6, 7], [...dishes, ...thursday], newPreferences);
  assert.deepEqual(current.issues, { 4: 'Már nem rendelhető' });
  assert.equal(current.lines[0].quantity, 3);
  assert.deepEqual(
    orderSummary({ ...plan, slots: { 4: { ...olderCombo, dishes: [soup] } } }, [4], dishes, newPreferences).issues,
    { 4: 'Már nem rendelhető' },
  );
  const excluded = orderSummary(plan, [4, 5, 6, 7], [...dishes, ...thursday], {
    ...preferences,
    filterCodes: true,
    excludedCodes: ['P'],
  });
  assert.deepEqual(excluded.issues, { 5: 'Kizárt Teletál-kód', 6: 'Kizárt Teletál-kód', 7: 'Kizárt Teletál-kód' });
  assert.equal(excluded.total, olderCombo.price);
  assert.equal(excluded.kcal, olderCombo.kcal, 'calories add up like the price, over the days that can be sent');
  const unknown = orderSummary({ ...plan, slots: { 4: { ...olderCombo, kcal: null } } }, [4], thursday, newPreferences);
  assert.equal(unknown.kcal, null, 'one day without calories makes the total unknown');
  assert.equal(plan.slots[5], option);
  assert.deepEqual(orderSummary(plan, [5, 6, 7], [], newPreferences).lines, []);
});

test('weekend days use the weekend lines Teletál publishes and Friday lines for the rest', () => {
  const saturdayZ10 = { ...fullDay[0], id: '6:1:Z10', day: 6, name: 'Saturday full day' };
  const saturdayIr = { ...ir, id: '6:1:IR', day: 6 };
  const catalog = [...dishes, saturdayZ10, saturdayIr];
  assert.deepEqual(dayCandidates(catalog, 5), dishes);
  assert.deepEqual(
    dayCandidates(catalog, 6).map(dish => dish.id),
    ['5:1:A1', '5:1:M', '5:1:T', '5:1:P', '5:1:Q', '5:1:Z11', '5:1:IRN', '6:1:Z10', '6:1:IR'],
  );
  assert.deepEqual(dayCandidates(catalog, 7), dishes);

  const fridayPick = options([fullDay[0]], 'fullDay')[0];
  const saturdayPick = options([saturdayZ10], 'fullDay')[0];
  const plan = { ...startPlan(week, 5), slots: { 5: fridayPick, 6: saturdayPick, 7: fridayPick } };
  const order = orderSummary(plan, [5, 6, 7], catalog, newPreferences);
  assert.deepEqual(order.issues, {});
  assert.deepEqual(
    order.lines.map(({ day, code, quantity }) => [day, code, quantity]),
    [
      [5, 'Z10', 2],
      [6, 'Z10', 1],
    ],
  );
  const savedBeforeWeekendLines = orderSummary({ ...plan, slots: { 6: fridayPick } }, [5, 6, 7], catalog, newPreferences);
  assert.deepEqual(savedBeforeWeekendLines.issues, { 6: 'Már nem rendelhető' });
});

test('deselected days are omitted from cart quantities without removing their saved meals', () => {
  const option = options([menu], 'lunch')[0];
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
  assert.deepEqual(
    upcomingWeeks(weeks, now).map(({ key }) => key),
    ['2026-W53', '2027-W01', '2027-W02'],
  );
  assert.equal(defaultWeek(weeks, now), '2027-W01');
  assert.equal(
    defaultWeek(
      weeks.filter(({ key }) => key !== '2027-W01'),
      now,
    ),
    '2026-W53',
  );
  assert.equal(mondayOfWeek('2027-W01')?.toISOString(), '2027-01-04T00:00:00.000Z');
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
  assert.equal(weekOptionLabel(week, 'long'), '48. hét (november 23–29.)');
  assert.equal(weekOptionLabel(week, 'short'), '48. hét (nov. 23–29.)');
  assert.equal(weekOptionLabel('2026-W49', 'long').replace(/\s+/g, ' '), '49. hét (november 30. – december 6.)');
  assert.equal(weekOptionLabel('2026-W53', 'short').replace(/\s+/g, ' '), '53. hét (dec. 28. – jan. 3.)');
});

test("dish details keep the brief names of Teletál's menu page, with calories and photos from the dish page", () => {
  const setMenu = dish({
    id: '3:1:P',
    code: 'P',
    kind: 'menu',
    name: 'Lencseleves / Eszterházy pulykatokány, jázmin rizs',
    price: 2470,
  });
  const long = [
    { name: 'Lencseleves', kcal: 401, kind: 'soup' as const, photo: null },
    {
      name: 'Eszterházy pulykatokány (mustáros, tejfölös, sárgarépás, fehérrépás ragu), jázminrizs',
      kcal: 762,
      kind: 'main' as const,
      photo: '/p.jpg',
    },
  ];
  const detailed = withDetails(setMenu, { id: setMenu.id, kcal: 1163, components: long, photo: '/p.jpg' });
  assert.deepEqual(
    detailed.components?.map(course => [course.name, course.kcal, course.photo]),
    [
      ['Lencseleves', 401, null],
      ['Eszterházy pulykatokány, jázmin rizs', 762, '/p.jpg'],
    ],
  );
  assert.equal(detailed.kcal, 1163);

  const threeCourses = [...long, { name: 'Somlói galuska', kcal: 300, kind: 'dessert' as const, photo: null }];
  assert.deepEqual(
    withDetails(setMenu, { id: setMenu.id, kcal: 1463, components: threeCourses }).components?.map(course => course.name),
    threeCourses.map(course => course.name),
    "names that do not match the courses one to one stay as Teletál's dish page has them",
  );

  const single = dish({ id: '3:1:Z8', code: 'Z8', name: 'Eszterházy pulykatokány, jázmin rizs', price: 2200 });
  const singleDetails = withDetails(single, { id: single.id, kcal: 762, components: [long[1]!] });
  assert.equal(singleDetails.name, 'Eszterházy pulykatokány, jázmin rizs');
  assert.equal(singleDetails.components?.[0]?.name, 'Eszterházy pulykatokány, jázmin rizs');
  assert.equal(withDetails(single, undefined).kcal, null);
});

test("a set menu's courses come from its details, or from its name until they load", () => {
  const menu = { ...dishes[0]!, name: 'Babeleves (füstölt csülökkel) / Rántott csirkemell' };
  assert.deepEqual(menuCourseNames({ ...menu, components: undefined }), ['Babeleves (füstölt csülökkel)', 'Rántott csirkemell']);
  const components = [
    { name: 'Babeleves', kcal: 300, photo: null },
    { name: 'Rántott csirkemell', kcal: 700, photo: null },
  ];
  assert.deepEqual(menuCourseNames({ ...menu, components }), ['Babeleves', 'Rántott csirkemell']);
});

test('dish names split into a title and the parenthesized description', () => {
  assert.deepEqual(
    splitDishName('Mikulás puttonya (diós, kandírozott narancsos töltött, rántott csirkemell), mandulás jázmin rizs'),
    {
      title: 'Mikulás puttonya, mandulás jázmin rizs',
      description: 'diós, kandírozott narancsos töltött, rántott csirkemell',
    },
  );
  assert.deepEqual(splitDishName('Rudolf ünnepi falatkái (Fahéjas csíkok (kis adag) rizzsel)'), {
    title: 'Rudolf ünnepi falatkái',
    description: 'Fahéjas csíkok (kis adag) rizzsel',
  });
  assert.deepEqual(splitDishName('Kenyércipó (burgonyás)'), { title: 'Kenyércipó', description: 'burgonyás' });
  assert.deepEqual(splitDishName('A (b) c (d)'), { title: 'A c', description: 'b · d' });
  assert.deepEqual(splitDishName('Lencseleves'), { title: 'Lencseleves', description: null });
  assert.deepEqual(splitDishName('(csak leírás)'), { title: '(csak leírás)', description: null });
  assert.deepEqual(splitDishName('Félig (nyitott'), { title: 'Félig (nyitott', description: null });
});

test('saved plans are restored per week, the previous single plan carries over, and ended weeks are dropped', () => {
  const now = new Date('2026-11-21T10:00:00Z');
  const current = startPlan('2026-W47', 6);
  const next = startPlan('2026-W48', 3);
  const ended = startPlan('2026-W46', 3);
  const stored = JSON.parse(JSON.stringify({ '2026-W46': ended, '2026-W47': current, '2026-W48': next, broken: { week: 'x' } }));
  assert.deepEqual(Object.keys(restorePlans(stored, null, now)).sort(), ['2026-W47', '2026-W48']);
  assert.deepEqual(restorePlans(null, JSON.parse(JSON.stringify(next)), now), {
    '2026-W48': restorePlan(JSON.parse(JSON.stringify(next))),
  });
  assert.deepEqual(restorePlans(stored, JSON.parse(JSON.stringify(ended)), now)['2026-W46'], undefined, 'the saved plans win');
  assert.deepEqual(restorePlans(null, null, now), {});
});
