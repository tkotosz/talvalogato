import { isCourse, normalizeCourses } from './courses.ts';
import { customOption, editCustom, remainingCalories, startCustom, withCourses } from './custom.ts';
import { generateMenu, startGenerator } from './generate.ts';
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
  | { type: 'saveCustom'; day: Day }
  // Generated days: the component selection, then whole menus to accept or reject
  | { type: 'startGenerated'; day: Day; seed: number }
  | { type: 'rejectGenerated'; day: Day }
  | { type: 'acceptGenerated'; day: Day };

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
    // Editing a custom day restores its courses into a draft; the saved day stays until the draft is saved.
    const saved = next.slots[day];
    if (edit && saved?.kind === 'custom') next = { ...next, custom: { ...next.custom, [day]: editCustom(saved) } };
    return withPlan(next, { step: 'meals', editingDay: edit ? day : null });
  }

  /** The plan with the current day's custom draft replaced, or the state unchanged when the action does not apply. */
  function withDraft(day: Day, update: (draft: CustomDraft) => CustomDraft | null): PlannerState {
    const draft = plan?.custom[day];
    if (!plan || !draft || day !== view.day || !eligible.includes(day)) return state;
    const next = update(draft);
    if (!next) return state;
    return withPlan({ ...plan, custom: { ...plan.custom, [day]: next } });
  }

  /** Saves the day's custom draft as its pick and shows the finished day. */
  function saveCustom(day: Day): PlannerState {
    const draft = plan?.custom[day];
    if (!plan || !draft || day !== view.day || !eligible.includes(day)) return state;
    const option = customOption(draft, state.preferences);
    if (!option) return state;
    const custom = { ...plan.custom };
    delete custom[day];
    return withPlan({ ...plan, day, slots: { ...plan.slots, [day]: option }, custom }, { editingDay: null });
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

  /** The generated draft with a new menu from the day's dishes, or null when it is not a generated day. */
  function withGeneratedMenu(draft: CustomDraft): CustomDraft | null {
    if (!draft.generator || !context.catalog) return null;
    const candidates = dayCandidates(context.catalog, view.day!);
    const { picks, generator } = generateMenu(candidates, draft.courses, state.preferences, draft.generator);
    return { ...draft, picks, generator, stage: 'generated' };
  }

  /** The state after the day got its decision: work in progress ends, and the planner moves on like `choose` does. */
  function finishDay(next: Plan): PlannerState {
    const custom = { ...next.custom };
    delete custom[view.day!];
    return withPlan({ ...next, custom }, { editingDay: null, step: next.day === null ? 'overview' : state.step });
  }

  /** Accepts the generated menu as the day's pick. A menu that no longer fits the menu or the settings is replaced instead. */
  function acceptGenerated(day: Day): PlannerState {
    const draft = plan?.custom[day];
    const catalog = context.catalog;
    if (!plan || !catalog || !draft?.generator || draft.stage !== 'generated' || day !== view.day || !eligible.includes(day))
      return state;
    const option = customOption(draft, state.preferences);
    if (!option) return state;
    if (selectionIssue(option, day, eligible, catalog, state.preferences)) {
      return withDraft(day, withGeneratedMenu);
    }
    return finishDay(choose(planOn(day), 'right', option, eligible));
  }

  switch (action.type) {
    case 'chooseWeek':
      return { ...state, selectedWeek: action.week };

    case 'setWeekDays': {
      const weekDays = { ...state.weekDays, [week]: action.days };
      return plan ? withPlan({ ...plan, selectedDays: action.days }, { weekDays }) : { ...state, weekDays };
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

    case 'startCustom': {
      const { day } = action;
      if (!context.catalog || day !== view.day || !eligible.includes(day)) return state;
      const current = planOn(day);
      return withPlan({ ...current, custom: { ...current.custom, [day]: startCustom(state.preferences) } });
    }

    case 'leaveCustom': {
      if (!plan?.custom[action.day]) return state;
      const custom = { ...plan.custom };
      delete custom[action.day];
      return withPlan({ ...plan, custom });
    }

    case 'setCourses': {
      // A generated day starts over with a new menu for the new components.
      const next = withDraft(action.day, draft => {
        const changed = withCourses(draft, action.courses);
        return draft.generator ? withGeneratedMenu({ ...changed, picks: {} }) : changed;
      });
      if (next === state) return next;
      return { ...next, preferences: { ...next.preferences, customCourses: normalizeCourses(action.courses) } };
    }

    case 'openStage':
      return withDraft(action.day, draft => {
        const { stage } = action;
        if (stage === 'select') return { ...draft, stage };
        // A generated day has no overview or component decks, and a picked day has no generated menu.
        if (draft.generator) return stage === 'generated' ? { ...draft, stage } : null;
        return stage === 'overview' || (isCourse(stage) && draft.courses.includes(stage)) ? { ...draft, stage } : null;
      });

    case 'pickCourse':
      return withDraft(action.day, draft => {
        if (!canPick(draft, action.dish)) return null;
        return { ...draft, picks: { ...draft.picks, [action.dish.course!]: action.dish }, stage: 'overview' };
      });

    case 'clearCourse':
      return withDraft(action.day, draft => {
        const course = draft.stage;
        if (!isCourse(course)) return null;
        const picks = { ...draft.picks };
        delete picks[course];
        return { ...draft, picks, stage: 'overview' };
      });

    case 'showOverLimit':
      return withDraft(action.day, draft => {
        const course = draft.stage;
        if (!isCourse(course) || draft.overLimit.includes(course)) return null;
        return { ...draft, overLimit: [...draft.overLimit, course] };
      });

    case 'saveCustom':
      return saveCustom(action.day);

    case 'startGenerated': {
      const { day } = action;
      if (!context.catalog || day !== view.day || !eligible.includes(day)) return state;
      const current = planOn(day);
      const draft = { ...startCustom(state.preferences), generator: startGenerator(action.seed) };
      return withPlan({ ...current, custom: { ...current.custom, [day]: draft } });
    }

    case 'rejectGenerated':
      return withDraft(action.day, draft => (draft.stage === 'generated' ? withGeneratedMenu(draft) : null));

    case 'acceptGenerated':
      return acceptGenerated(action.day);
  }
}
