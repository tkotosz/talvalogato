import { normalizeCourses } from './courses.ts';
import { customOption, editCustom, remainingCalories, startCustom, withCourses } from './custom.ts';
import {
  choose,
  dayCandidates,
  orderSummary,
  selectionIssue,
  startPlan,
  type DeckAction,
  type OrderSummary,
} from './planning.ts';
import type {
  CatalogDish,
  CustomCourse,
  CustomDraft,
  CustomStage,
  Day,
  Dish,
  MenuOption,
  Plan,
  Preferences,
  PublishedWeek,
  WeekKey,
} from './types.ts';
import { defaultWeek, eligibleDays } from './weeks.ts';

export type Step = 'week' | 'meals' | 'overview';

/** The state of the planning flow. `plan` and `preferences` are saved; the rest lasts for the session. */
export interface PlannerState {
  step: Step;
  /** The week chosen on the week screen, or empty to use the recommended week. */
  selectedWeek: WeekKey;
  /** Day choices for weeks that have no plan yet. */
  weekDays: Record<WeekKey, Day[]>;
  /** The finished day whose saved pick is being replaced. */
  editingDay: Day | null;
  plan: Plan | null;
  preferences: Preferences;
  /** Set while the user confirms replacing a plan that has progress with a plan for another week. */
  pendingNewPlan: { week: WeekKey; step: Step } | null;
}

export type PlannerAction =
  | { type: 'chooseWeek'; week: WeekKey }
  | { type: 'setWeekDays'; days: Day[] }
  | { type: 'navigate'; step: Step }
  | { type: 'confirmNewPlan' }
  | { type: 'cancelNewPlan' }
  | { type: 'resetWeek' }
  | { type: 'openDay'; day: Day; edit?: boolean }
  | { type: 'decide'; day: Day; action: DeckAction; option?: MenuOption | null }
  | { type: 'savePreferences'; preferences: Preferences }
  // Custom days
  | { type: 'startCustom'; day: Day }
  | { type: 'leaveCustom'; day: Day }
  | { type: 'setCourses'; day: Day; courses: CustomCourse[] }
  | { type: 'openStage'; day: Day; stage: CustomStage }
  | { type: 'pickCourse'; day: Day; dish: Dish }
  | { type: 'clearCourse'; day: Day }
  | { type: 'showOverLimit'; day: Day }
  | { type: 'saveCustom'; day: Day };

/** What the planner needs from outside: published weeks that still have orderable days, the active week's catalog, and the time. */
export interface PlannerContext {
  weeks: PublishedWeek[];
  /** The active week's catalog, or null while it loads. */
  catalog: CatalogDish[] | null;
  now: Date;
}

export interface PlannerView {
  week: WeekKey;
  recommended: WeekKey;
  /** The saved plan when it belongs to the active week, otherwise an empty plan for it. */
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

export function initialPlanner(plan: Plan | null, preferences: Preferences): PlannerState {
  return { step: 'week', selectedWeek: '', weekDays: {}, editingDay: null, plan, preferences, pendingNewPlan: null };
}

export function deliveryDays(catalog: CatalogDish[]): Set<Day> {
  return new Set(catalog.map(dish => dish.day));
}

/** The week the planner works on: the chosen week on the week screen, otherwise the saved plan's week. */
export function activeWeek(state: PlannerState, weeks: PublishedWeek[], now: Date): WeekKey {
  const recommended = defaultWeek(weeks, now);
  if (state.step === 'week') return weeks.some(item => item.key === state.selectedWeek) ? state.selectedWeek : recommended;
  return state.plan?.week ?? recommended;
}

export function plannerView(state: PlannerState, { weeks, catalog, now }: PlannerContext): PlannerView {
  const { plan, preferences, step } = state;
  const week = activeWeek(state, weeks, now);
  const selectedDays = plan?.week === week ? plan.selectedDays : (state.weekDays[week] ?? preferences.defaultDays);
  const activePlan: Plan =
    plan?.week === week ? plan : { id: '', week, day: null, selectedDays, slots: {}, drafts: {}, custom: {} };
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

export function reducePlanner(state: PlannerState, action: PlannerAction, context: PlannerContext): PlannerState {
  const view = plannerView(state, context);
  const { week, eligible, selectedDays } = view;

  // Leaves the week screen for a step, starting a plan for the chosen week when needed.
  function openWeek(target: Step): PlannerState {
    const plan = week && state.plan?.week !== week ? startPlan(week, eligible[0] ?? null, selectedDays) : state.plan;
    return { ...state, plan, step: target, editingDay: null, pendingNewPlan: null };
  }

  function openDay(day: Day, edit: boolean): PlannerState {
    if (!eligible.includes(day)) return state;
    let plan = state.plan?.week === week ? { ...state.plan, day } : startPlan(week, day, selectedDays);
    // Editing a custom day restores its courses into a draft; the saved day stays until the draft is saved.
    const saved = plan.slots[day];
    if (edit && saved?.kind === 'custom') plan = { ...plan, custom: { ...plan.custom, [day]: editCustom(saved) } };
    return { ...state, plan, step: 'meals', editingDay: edit ? day : null };
  }

  /** The plan with the current day's custom draft replaced, or null when the action does not apply to the current day. */
  function withDraft(day: Day, update: (draft: CustomDraft) => CustomDraft | null): PlannerState {
    const plan = state.plan;
    const draft = plan?.week === week ? plan.custom[day] : undefined;
    if (!plan || !draft || day !== view.day || !eligible.includes(day)) return state;
    const next = update(draft);
    if (!next) return state;
    return { ...state, plan: { ...plan, custom: { ...plan.custom, [day]: next } } };
  }

  /** Saves the day's custom draft as its pick and shows the finished day. */
  function saveCustom(day: Day): PlannerState {
    const plan = state.plan;
    const draft = plan?.custom[day];
    if (!plan || !draft || day !== view.day || !eligible.includes(day)) return state;
    const option = customOption(draft, state.preferences);
    if (!option) return state;
    const custom = { ...plan.custom };
    delete custom[day];
    return { ...state, plan: { ...plan, day, slots: { ...plan.slots, [day]: option }, custom }, editingDay: null };
  }

  /** Whether `dish` may fill the current course: still on the menu, not excluded, and within the limit unless the user allowed more. */
  function canPick(draft: CustomDraft, dish: Dish): boolean {
    const course = draft.stage;
    const catalog = context.catalog;
    if (!catalog || dish.course !== course) return false;
    if (!dayCandidates(catalog, view.day!).some(item => item.day === dish.day && item.code === dish.code)) return false;
    const { preferences } = state;
    if (preferences.filterCodes && preferences.excludedCodes.includes(dish.code)) return false;
    const remaining = remainingCalories(draft, preferences, course);
    if (remaining === null) return true;
    return Number.isFinite(dish.kcal) && (dish.kcal! <= remaining || draft.overLimit.includes(course));
  }

  switch (action.type) {
    case 'chooseWeek':
      return { ...state, selectedWeek: action.week };

    case 'setWeekDays': {
      const weekDays = { ...state.weekDays, [week]: action.days };
      const plan = state.plan?.week === week ? { ...state.plan, selectedDays: action.days } : state.plan;
      return { ...state, weekDays, plan };
    }

    case 'navigate': {
      const target = action.step;
      if (target === state.step) return state;
      if (target === 'week') return { ...state, step: 'week', selectedWeek: week };
      if (state.step === 'week') {
        if (week && view.hasSavedProgress && state.plan?.week !== week) {
          return { ...state, pendingNewPlan: { week, step: target } };
        }
        return openWeek(target);
      }
      if (target === 'meals' && context.catalog && eligible[0] !== undefined) return openDay(eligible[0], false);
      return { ...state, step: target };
    }

    case 'confirmNewPlan':
      if (!state.pendingNewPlan) return state;
      if (state.pendingNewPlan.week !== week) return { ...state, pendingNewPlan: null };
      return openWeek(state.pendingNewPlan.step);

    case 'cancelNewPlan':
      return { ...state, pendingNewPlan: null };

    case 'resetWeek':
      // Starting over clears the week's decisions and returns to the week screen.
      if (state.plan?.week !== week) return state;
      return {
        ...state,
        plan: startPlan(week, null, state.plan.selectedDays),
        editingDay: null,
        step: 'week',
        selectedWeek: week,
      };

    case 'openDay':
      return openDay(action.day, action.edit === true);

    case 'decide': {
      const { day, action: decision, option } = action;
      const catalog = context.catalog;
      if (!catalog || day !== view.day || !eligible.includes(day)) return state;
      if (decision === 'right' && (!option || selectionIssue(option, day, eligible, catalog, state.preferences))) return state;
      if ((decision === 'left' || decision === 'up') && !option) return state;
      const current = state.plan?.week === week ? { ...state.plan, day } : startPlan(week, day, selectedDays);
      const plan = choose(current, decision, option, eligible);
      if (decision !== 'right' && decision !== 'skip') return { ...state, plan };
      // Deciding the whole day ends a custom day in progress.
      const custom = { ...plan.custom };
      delete custom[day];
      return { ...state, plan: { ...plan, custom }, editingDay: null, step: plan.day === null ? 'overview' : state.step };
    }

    case 'savePreferences':
      return { ...state, preferences: action.preferences };

    case 'startCustom': {
      const { day } = action;
      if (!context.catalog || day !== view.day || !eligible.includes(day)) return state;
      const current = state.plan?.week === week ? { ...state.plan, day } : startPlan(week, day, selectedDays);
      return { ...state, plan: { ...current, custom: { ...current.custom, [day]: startCustom(state.preferences) } } };
    }

    case 'leaveCustom': {
      if (!state.plan || state.plan.week !== week || !state.plan.custom[action.day]) return state;
      const custom = { ...state.plan.custom };
      delete custom[action.day];
      return { ...state, plan: { ...state.plan, custom } };
    }

    case 'setCourses': {
      const next = withDraft(action.day, draft => withCourses(draft, action.courses));
      if (next === state) return next;
      return { ...next, preferences: { ...next.preferences, customCourses: normalizeCourses(action.courses) } };
    }

    case 'openStage':
      return withDraft(action.day, draft => {
        const { stage } = action;
        return stage === 'select' || stage === 'overview' || draft.courses.includes(stage) ? { ...draft, stage } : null;
      });

    case 'pickCourse':
      return withDraft(action.day, draft => {
        if (!canPick(draft, action.dish)) return null;
        return { ...draft, picks: { ...draft.picks, [action.dish.course!]: action.dish }, stage: 'overview' };
      });

    case 'clearCourse':
      return withDraft(action.day, draft => {
        const course = draft.stage;
        if (course === 'select' || course === 'overview') return null;
        const picks = { ...draft.picks };
        delete picks[course];
        return { ...draft, picks, stage: 'overview' };
      });

    case 'showOverLimit':
      return withDraft(action.day, draft => {
        const course = draft.stage;
        if (course === 'select' || course === 'overview' || draft.overLimit.includes(course)) return null;
        return { ...draft, overLimit: [...draft.overLimit, course] };
      });

    case 'saveCustom':
      return saveCustom(action.day);
  }
}
