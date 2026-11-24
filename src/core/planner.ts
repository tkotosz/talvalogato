import {
  canGenerate,
  customOption,
  editCustom,
  emptyRows,
  emptyTray,
  fitsRow,
  pickedDishes,
  remainingCalories,
  remainingMoney,
  totalCalories,
  totalPrice,
  withCourse,
  withoutDish,
  withoutRow,
  withPick,
} from './custom.ts';
import { dishIssue } from './filters.ts';
import { generateMenu, startGenerator } from './generate.ts';
import {
  choose,
  dayCandidates,
  moneyLeft,
  orderSummary,
  selectionIssue,
  startPlan,
  type DeckAction,
  type OrderSummary,
} from './planning.ts';
import type {
  CustomDraft,
  CustomStage,
  Day,
  Dish,
  MenuOption,
  Plan,
  Preferences,
  PublishedWeek,
  TrayCourse,
  WeekKey,
} from './types.ts';
import { defaultWeek, eligibleDays } from './weeks.ts';

export type Step = 'week' | 'meals' | 'overview';

/** The state of the planning flow. `plans` and `preferences` are saved; the rest lasts for the session. */
export interface PlannerState {
  step: Step;
  /** The week being planned, or empty to use the recommended week. */
  selectedWeek: WeekKey;
  /** Day choices for weeks that have no plan yet. */
  weekDays: Record<WeekKey, Day[]>;
  /** The finished day whose saved pick is being replaced. */
  editingDay: Day | null;
  /** Each week's plan, so weeks are planned independently of each other. */
  plans: Record<WeekKey, Plan>;
  preferences: Preferences;
}

export type PlannerAction =
  | { type: 'chooseWeek'; week: WeekKey }
  | { type: 'setWeekDays'; days: Day[] }
  | { type: 'navigate'; step: Step }
  | { type: 'resetWeek' }
  | { type: 'openDay'; day: Day; edit?: boolean }
  | { type: 'clearDay'; day: Day }
  // Kész on the tray; leaving the day saves the tray too
  | { type: 'saveTray'; day: Day }
  | { type: 'decide'; day: Day; action: DeckAction; option?: MenuOption | null }
  | { type: 'savePreferences'; preferences: Preferences }
  // The day's tray: rows of Teletál set menus and single dishes, added empty, then filled from their deck or list
  | { type: 'openStage'; day: Day; stage: CustomStage }
  | { type: 'pickCourse'; day: Day; dish: Dish }
  | { type: 'clearCourse'; day: Day }
  | { type: 'addCourse'; day: Day; course: TrayCourse }
  | { type: 'emptyCourse'; day: Day; row: number }
  | { type: 'removeCourse'; day: Day; row: number }
  | { type: 'showOverLimit'; day: Day }
  // Ideas: generated dishes for the tray's empty rows, to keep, replace or cancel
  | { type: 'startGenerated'; day: Day; seed: number }
  | { type: 'rejectGenerated'; day: Day }
  | { type: 'acceptGenerated'; day: Day }
  | { type: 'cancelGenerated'; day: Day };

/** What the planner needs from outside: published weeks that still have orderable days, the active week's catalog, and the time. */
export interface PlannerContext {
  weeks: PublishedWeek[];
  /** The active week's dishes, or null while they load. */
  catalog: Dish[] | null;
  now: Date;
}

export interface PlannerView {
  week: WeekKey;
  recommended: WeekKey;
  /** The active week's saved plan, or an empty plan for it. */
  plan: Plan;
  selectedDays: Day[];
  /** Days Teletál still takes orders for, whether or not the user selected them. */
  availableDays: Day[];
  /** Selected days that can still be ordered. */
  eligible: Day[];
  /** Days the overview lists: eligible days, plus earlier days that still hold a pick. */
  reviewDays: Day[];
  /** The day the meal picker shows. */
  day: Day | undefined;
  editing: boolean;
  /** The picker's day already has a decision and is not being edited. */
  dayDone: boolean;
  /** The picker's day as a custom day in progress, if it is one. */
  custom: CustomDraft | null;
  /** The orderable days before and after the picker's day, in calendar order. */
  previousDay: Day | undefined;
  nextDay: Day | undefined;
  hasSavedProgress: boolean;
  /** Cart contents once the catalog has loaded and the overview has days to show. */
  order: OrderSummary | null;
}

export function initialPlanner(plans: Record<WeekKey, Plan>, preferences: Preferences): PlannerState {
  return { step: 'week', selectedWeek: '', weekDays: {}, editingDay: null, plans, preferences };
}

export function deliveryDays(catalog: Pick<Dish, 'day'>[]): Set<Day> {
  return new Set(catalog.map(dish => dish.day));
}

/** The week the planner works on: the chosen week while it is published, otherwise the recommended week. */
export function activeWeek(state: PlannerState, weeks: PublishedWeek[], now: Date): WeekKey {
  return weeks.some(item => item.key === state.selectedWeek) ? state.selectedWeek : defaultWeek(weeks, now);
}

export function plannerView(state: PlannerState, { weeks, catalog, now }: PlannerContext): PlannerView {
  const { preferences, step } = state;
  const week = activeWeek(state, weeks, now);
  const plan = state.plans[week] ?? null;
  const selectedDays = plan ? plan.selectedDays : (state.weekDays[week] ?? preferences.defaultDays);
  const activePlan: Plan = plan ?? { id: '', week, day: null, selectedDays, slots: {}, drafts: {}, custom: {} };
  const availableDays = eligibleDays(week, now, catalog ? deliveryDays(catalog) : undefined);
  const eligible = availableDays.filter(day => selectedDays.includes(day));
  const reviewDays = selectedDays.filter(day => eligible.includes(day) || activePlan.slots[day]);
  const day = activePlan.day !== null && eligible.includes(activePlan.day) ? activePlan.day : eligible[0];
  const editing = day !== undefined && state.editingDay === day;
  return {
    week,
    recommended: defaultWeek(weeks, now),
    plan: activePlan,
    selectedDays,
    availableDays,
    eligible,
    reviewDays,
    day,
    editing,
    dayDone: step === 'meals' && catalog !== null && day !== undefined && !editing && Object.hasOwn(activePlan.slots, day),
    custom: (day !== undefined && activePlan.custom[day]) || null,
    previousDay: day === undefined ? undefined : eligible.findLast(candidate => candidate < day),
    nextDay: day === undefined ? undefined : eligible.find(candidate => candidate > day),
    hasSavedProgress: plan !== null && [plan.slots, plan.drafts, plan.custom].some(record => Object.keys(record).length > 0),
    order: step === 'overview' && catalog && reviewDays.length ? orderSummary(activePlan, eligible, catalog, preferences) : null,
  };
}

/** The tray as it was before the idea: the rows it filled are empty again, and the idea is gone. */
function withoutGenerated(draft: CustomDraft): CustomDraft {
  const filled = draft.generator?.rows ?? [];
  const rows = draft.rows.map((row, index) => (filled.includes(index) ? { course: row.course } : row));
  const tray: CustomDraft = { ...draft, rows, stage: 'overview' };
  delete tray.generator;
  return tray;
}

export function reducePlanner(state: PlannerState, action: PlannerAction, context: PlannerContext): PlannerState {
  const view = plannerView(state, context);
  const { week, eligible, selectedDays } = view;
  const plan = state.plans[week];

  /** The state with `next` as its week's plan. */
  function withPlan(next: Plan, changes: Partial<PlannerState> = {}): PlannerState {
    return { ...state, ...changes, plans: { ...state.plans, [next.week]: next } };
  }

  /** The active week's plan opened on `day`, started when the week has none yet. */
  function planOn(day: Day): Plan {
    return plan ? { ...plan, day } : startPlan(week, day, selectedDays);
  }

  // Leaves the week screen for a step, starting a plan for the chosen week when it has none yet.
  function openWeek(target: Step): PlannerState {
    const changes = { step: target, editingDay: null, selectedWeek: week };
    if (!week || plan) return { ...state, ...changes };
    return withPlan(startPlan(week, eligible[0] ?? null, selectedDays), changes);
  }

  function openDay(day: Day, edit: boolean): PlannerState {
    if (!eligible.includes(day)) return state;
    let next = planOn(day);
    // Editing a day puts its dishes back on the tray; the saved day stays until the tray is saved.
    const saved = next.slots[day];
    if (edit && saved) next = { ...next, custom: { ...next.custom, [day]: editCustom(saved) } };
    return withPlan(next, { step: 'meals', editingDay: edit ? day : null });
  }

  /** What the weekly spending limit leaves for the meal picker's day, or null without a limit. */
  function dayMoney(): number | null {
    return view.day === undefined ? null : moneyLeft(view.plan, view.day, eligible, state.preferences);
  }

  /** The plan with the current day's custom draft replaced, or the state unchanged when the action does not apply. */
  function withDraft(day: Day, update: (draft: CustomDraft) => CustomDraft | null): PlannerState {
    const draft = plan?.custom[day];
    if (!plan || !draft || day !== view.day || !eligible.includes(day)) return state;
    const next = update(draft);
    if (!next) return state;
    return withPlan({ ...plan, custom: { ...plan.custom, [day]: next } });
  }

  /**
   * Saves the tray of the day the meal picker shows, with Kész or before an action leaves that day. Its dishes become the day's pick;
   * an idea not kept yet and empty rows are left out. A saved day being edited whose tray has no dishes left has no
   * decision again. A new tray without dishes stays as it is, for later.
   */
  function saveTray(): PlannerState {
    const day = view.day;
    const draft = day === undefined ? undefined : plan?.custom[day];
    if (state.step !== 'meals' || !plan || day === undefined || !draft || !eligible.includes(day)) return state;
    const option = customOption(withoutGenerated(draft), state.preferences);
    if (!option && state.editingDay !== day) return state;
    const slots = { ...plan.slots };
    const custom = { ...plan.custom };
    if (option) slots[day] = option;
    else delete slots[day];
    delete custom[day];
    return withPlan({ ...plan, slots, custom }, { editingDay: null });
  }

  /**
   * Whether `dish` may fill the current course: still on the menu, allowed by the settings as the current menu data has it,
   * and within the calorie and spending limits unless the user allowed more.
   */
  function canPick(draft: CustomDraft, dish: Dish): boolean {
    const index = draft.stage;
    const catalog = context.catalog;
    if (typeof index !== 'number') return false;
    const course = draft.rows[index]?.course;
    if (!catalog || !course || !fitsRow(dish, course)) return false;
    const current = dayCandidates(catalog, view.day!).find(item => item.day === dish.day && item.code === dish.code);
    const { preferences } = state;
    if (!current || dishIssue(current, preferences)) return false;
    const remaining = remainingCalories(draft, preferences, index);
    if (remaining !== null && !Number.isFinite(dish.kcal)) return false;
    const money = remainingMoney(draft, index, dayMoney());
    const fits = (remaining === null || dish.kcal! <= remaining) && (money === null || dish.price <= money);
    return fits || draft.overLimit.includes(course);
  }

  /**
   * The tray with newly generated dishes on the rows the generator fills, within the calories and the forints the rest of
   * the tray leaves, or null when no menu is being generated.
   */
  function withGeneratedMenu(draft: CustomDraft): CustomDraft | null {
    if (!draft.generator || !context.catalog) return null;
    const filled = draft.generator.rows;
    const kept = withoutGenerated(draft);
    const used = totalCalories(pickedDishes(kept)) ?? 0;
    const forDay = dayMoney();
    const money = forDay === null ? null : forDay - totalPrice(pickedDishes(kept));
    const candidates = dayCandidates(context.catalog, view.day!);
    const courses = filled.map(index => kept.rows[index]!.course);
    const generated = generateMenu(candidates, courses, state.preferences, draft.generator, used, money);
    const rows = kept.rows.map((row, index) => {
      const dish = filled.includes(index) ? generated.dishes[filled.indexOf(index)] : undefined;
      return dish ? { course: row.course, dish } : row;
    });
    return { ...kept, rows, generator: generated.generator, stage: 'generated' };
  }

  /** The state after the day got its decision: work in progress ends, and the planner moves on like `choose` does. */
  function finishDay(next: Plan): PlannerState {
    const custom = { ...next.custom };
    delete custom[view.day!];
    return withPlan({ ...next, custom }, { editingDay: null, step: next.day === null ? 'overview' : state.step });
  }

  /**
   * Keeps the generated dishes on the tray. Generated dishes that no longer fit the menu or the settings are replaced
   * instead.
   */
  function acceptGenerated(day: Day): PlannerState {
    const draft = plan?.custom[day];
    const catalog = context.catalog;
    if (!plan || !catalog || !draft?.generator || draft.stage !== 'generated' || day !== view.day || !eligible.includes(day))
      return state;
    // Only the generated dishes are checked; the rest of the tray was there before.
    const filled = draft.generator.rows;
    const generatedOnly: CustomDraft = {
      rows: draft.rows.filter((_, index) => filled.includes(index)),
      stage: 'overview',
      overLimit: [],
    };
    const option = customOption(generatedOnly, state.preferences);
    if (!option) return state;
    if (selectionIssue(option, day, eligible, catalog, state.preferences)) {
      return withDraft(day, withGeneratedMenu);
    }
    return withDraft(day, current => {
      const accepted: CustomDraft = { ...current, stage: 'overview' };
      delete accepted.generator;
      return accepted;
    });
  }

  // Leaving the meal picker's day saves its tray first, so the overview and the cart hold what the tray shows.
  const leavesDay =
    (action.type === 'navigate' && action.step !== state.step) || (action.type === 'openDay' && action.day !== view.day);
  if (leavesDay) {
    const saved = saveTray();
    if (saved !== state) return reducePlanner(saved, action, context);
  }

  switch (action.type) {
    case 'chooseWeek':
      return { ...state, selectedWeek: action.week };

    case 'setWeekDays': {
      const weekDays = { ...state.weekDays, [week]: action.days };
      // The last choice with any day in it is preselected for weeks without a plan.
      const preferences = action.days.length ? { ...state.preferences, defaultDays: action.days } : state.preferences;
      return plan
        ? withPlan({ ...plan, selectedDays: action.days }, { weekDays, preferences })
        : { ...state, weekDays, preferences };
    }

    case 'navigate': {
      const target = action.step;
      if (target === state.step) return state;
      if (target === 'week') return { ...state, step: 'week', selectedWeek: week };
      if (state.step === 'week') return openWeek(target);
      if (target === 'meals' && context.catalog && eligible[0] !== undefined) return openDay(eligible[0], false);
      return { ...state, step: target };
    }

    case 'resetWeek':
      // Starting over clears the week's decisions and returns to the week screen.
      if (!plan) return state;
      return withPlan(startPlan(week, null, plan.selectedDays), { editingDay: null, step: 'week', selectedWeek: week });

    case 'openDay':
      return openDay(action.day, action.edit === true);

    case 'saveTray':
      return action.day === view.day ? saveTray() : state;

    case 'clearDay': {
      // Removes the day's choice and any work in progress, so the day has no decision again.
      const { day } = action;
      if (!plan || day !== view.day || !eligible.includes(day)) return state;
      const slots = { ...plan.slots };
      const drafts = { ...plan.drafts };
      const custom = { ...plan.custom };
      delete slots[day];
      delete drafts[day];
      delete custom[day];
      return withPlan({ ...plan, day, slots, drafts, custom }, { editingDay: null });
    }

    case 'decide': {
      const { day, action: decision, option } = action;
      const catalog = context.catalog;
      if (!catalog || day !== view.day || !eligible.includes(day)) return state;
      if (decision === 'right' && (!option || selectionIssue(option, day, eligible, catalog, state.preferences))) return state;
      if ((decision === 'left' || decision === 'up') && !option) return state;
      const next = choose(planOn(day), decision, option, eligible);
      if (decision !== 'right' && decision !== 'skip') return withPlan(next);
      // Deciding the whole day ends a custom day in progress.
      return finishDay(next);
    }

    case 'savePreferences':
      return { ...state, preferences: action.preferences };

    case 'openStage':
      return withDraft(action.day, draft => {
        const { stage } = action;
        // A generated menu waits to be accepted before the tray opens.
        if (draft.generator) return stage === 'generated' ? { ...draft, stage } : null;
        if (stage === 'overview') return { ...draft, stage };
        // A row's deck or list opens by the row's index.
        return typeof stage === 'number' && draft.rows[stage] ? { ...draft, stage } : null;
      });

    case 'pickCourse':
      return withDraft(action.day, draft =>
        canPick(draft, action.dish) ? withPick(draft, draft.stage as number, action.dish) : null,
      );

    case 'clearCourse':
      // Nem kérek: the open row stays on the tray without a dish.
      return withDraft(action.day, draft =>
        typeof draft.stage === 'number' && draft.rows[draft.stage] ? withoutDish(draft, draft.stage) : null,
      );

    case 'addCourse': {
      // The first row starts the day's tray.
      const { day } = action;
      if (!context.catalog || day !== view.day || !eligible.includes(day)) return state;
      const current = planOn(day);
      const draft = current.custom[day] ?? emptyTray();
      if (draft.generator) return state;
      return withPlan({ ...current, custom: { ...current.custom, [day]: withCourse(draft, action.course) } });
    }

    case 'emptyCourse':
      return withDraft(action.day, draft =>
        !draft.generator && draft.rows[action.row]?.dish ? withoutDish(draft, action.row) : null,
      );

    case 'removeCourse':
      return withDraft(action.day, draft => (!draft.generator && draft.rows[action.row] ? withoutRow(draft, action.row) : null));

    case 'showOverLimit':
      return withDraft(action.day, draft => {
        const course = typeof draft.stage === 'number' ? draft.rows[draft.stage]?.course : undefined;
        if (!course || draft.overLimit.includes(course)) return null;
        return { ...draft, overLimit: [...draft.overLimit, course] };
      });

    case 'startGenerated':
      // An idea for every empty row on a tray of at least two rows.
      return withDraft(action.day, draft => {
        if (draft.generator || !canGenerate(draft)) return null;
        return withGeneratedMenu({ ...draft, generator: startGenerator(action.seed, emptyRows(draft)) });
      });

    case 'cancelGenerated':
      return withDraft(action.day, draft => (draft.generator ? withoutGenerated(draft) : null));

    case 'rejectGenerated':
      return withDraft(action.day, draft => (draft.stage === 'generated' ? withGeneratedMenu(draft) : null));

    case 'acceptGenerated':
      return acceptGenerated(action.day);
  }
}
