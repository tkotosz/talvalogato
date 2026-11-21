import { useState } from 'react';
import { Check, ChevronRight, Flame, Minus, Plus } from 'lucide-react';
import { courseNames, extraCourses, mainCourses } from '../../core/courses.ts';
import { courseDeck, pickedDishes, remainingCalories, totalCalories } from '../../core/custom.ts';
import type { PlannerAction } from '../../core/planner.ts';
import { calorieLimit, dayCandidates } from '../../core/planning.ts';
import type { Dish, CustomCourse, CustomDraft, Day, Plan, Preferences } from '../../core/types.ts';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { calories, money } from '../format.ts';

const courseNouns = { missing: 'ételhez', again: 'Ételek újranézése' };

/** Toggle buttons for a group of components. */
function CourseChoices({
  label,
  courses,
  selected,
  onChange,
}: {
  label: string;
  courses: CustomCourse[];
  selected: CustomCourse[];
  onChange(courses: CustomCourse[]): void;
}) {
  return (
    <fieldset className="day-choices course-choices">
      <legend>{label}</legend>
      <div className="course-choices-grid">
        {courses.map(course => {
          const pressed = selected.includes(course);
          return (
            <button
              key={course}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(pressed ? selected.filter(value => value !== course) : [...selected, course])}
            >
              {pressed ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {courseNames[course]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Step 1 of a custom day: which components the menu has. */
function CourseSelection({ draft, onDone }: { draft: CustomDraft; onDone(courses: CustomCourse[]): void }) {
  const [selected, setSelected] = useState(draft.courses);
  return (
    <section className="custom-step">
      <h2>Miből álljon a menü?</h2>
      <CourseChoices label="Fogások" courses={mainCourses} selected={selected} onChange={setSelected} />
      <CourseChoices label="Kiegészítők" courses={extraCourses} selected={selected} onChange={setSelected} />
      <button type="button" className="button primary wide" disabled={!selected.length} onClick={() => onDone(selected)}>
        Tovább
      </button>
    </section>
  );
}

/** Step 2 of a custom day: each component with its dish; a row opens the component's deck. */
function MenuOverview({
  draft,
  preferences,
  saved,
  onOpen,
  onSave,
}: {
  draft: CustomDraft;
  preferences: Preferences;
  /** The day already has a saved menu that this draft edits. */
  saved: boolean;
  onOpen(stage: CustomDraft['stage']): void;
  onSave(): void;
}) {
  const dishes = pickedDishes(draft);
  const total = totalCalories(dishes);
  const limit = preferences.limitCalories ? calorieLimit(preferences) : null;
  const overLimit = limit !== null && total !== null && total > limit;
  return (
    <section className="custom-step">
      <h2>Saját menü</h2>
      <p className="custom-hint">Koppints egy sorra az étel kiválasztásához vagy cseréjéhez.</p>
      <ul className="custom-summary">
        {draft.courses.map(course => {
          const dish = draft.picks[course];
          return (
            <li key={course}>
              <button type="button" onClick={() => onOpen(course)}>
                <strong>{courseNames[course]}</strong>
                <span className={dish ? undefined : 'custom-empty'}>{dish ? dish.name : 'Nincs kiválasztva'}</span>
                <span>{dish ? calories(dish.kcal) : <ChevronRight size={16} aria-label="Kiválasztás" />}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="custom-total" aria-live="polite">
        <span>Összesen</span>
        <strong>{dishes.length ? (total === null ? 'ismeretlen kcal' : calories(total)) : '–'}</strong>
        <strong>{money(dishes.reduce((sum, dish) => sum + dish.price, 0))}</strong>
      </p>
      {limit !== null && (
        <p className={overLimit ? 'over-limit-note' : 'custom-hint'}>
          {overLimit ? `A menü ${calories(total! - limit)} kalóriával a kereted felett van.` : `Napi keret: ${calories(limit)}`}
        </p>
      )}
      <button type="button" className="button primary wide" disabled={!dishes.length} onClick={onSave}>
        {saved ? 'Változások mentése' : 'Mentés'}
      </button>
    </section>
  );
}

/** The custom-day flow for the plan's day: the component selection, the menu overview, and one deck per component. */
export function CustomDay({
  plan,
  day,
  draft,
  catalog,
  preferences,
  dispatch,
}: {
  plan: Plan;
  day: Day;
  draft: CustomDraft;
  catalog: Dish[];
  preferences: Preferences;
  dispatch(action: PlannerAction): void;
}) {
  const { stage } = draft;
  if (stage === 'select') {
    return <CourseSelection draft={draft} onDone={courses => dispatch({ type: 'setCourses', day, courses })} />;
  }
  if (stage === 'overview') {
    return (
      <MenuOverview
        draft={draft}
        preferences={preferences}
        saved={plan.slots[day]?.kind === 'custom'}
        onOpen={next => dispatch({ type: 'openStage', day, stage: next })}
        onSave={() => dispatch({ type: 'saveCustom', day })}
      />
    );
  }
  return (
    <CourseDeck
      key={stage}
      plan={plan}
      day={day}
      course={stage}
      draft={draft}
      catalog={catalog}
      preferences={preferences}
      dispatch={dispatch}
    />
  );
}

function CourseDeck({
  plan,
  day,
  course,
  draft,
  catalog,
  preferences,
  dispatch,
}: {
  plan: Plan;
  day: Day;
  course: CustomCourse;
  draft: CustomDraft;
  catalog: Dish[];
  preferences: Preferences;
  dispatch(action: PlannerAction): void;
}) {
  const candidates = dayCandidates(catalog, day).filter(dish => dish.course === course);
  const remaining = remainingCalories(draft, preferences, course);
  return (
    <>
      <div className="picker-details course-details">
        <strong>{courseNames[course]}</strong>
        {remaining !== null && (
          <span className="day-budget">
            <Flame size={18} aria-hidden="true" /> Még {calories(Math.max(0, remaining))}
          </span>
        )}
      </div>
      <SwipeDeck
        plan={plan}
        day={day}
        candidates={candidates}
        buildOptions={loaded => courseDeck(loaded, course, draft, preferences).options}
        target={remaining}
        nouns={courseNouns}
        empty={loaded => {
          const { overLimitCount } = courseDeck(loaded, course, draft, preferences);
          return overLimitCount > 0 && !draft.overLimit.includes(course) ? (
            <>
              <span className="section-icon">
                <Minus size={25} />
              </span>
              <h2>Nincs a keretbe férő étel</h2>
              <p>A kalóriakeretedből {calories(Math.max(0, remaining ?? 0))} maradt erre a fogásra.</p>
              <button type="button" className="button secondary" onClick={() => dispatch({ type: 'showOverLimit', day })}>
                Mutasd a kereten felülieket is
              </button>
            </>
          ) : (
            <>
              <h2>Nincs választható étel</h2>
              <p>Ebből ma nincs rendelhető étel, vagy a szűrőid mindet kizárják.</p>
            </>
          );
        }}
        onAction={(action, option) =>
          action === 'right'
            ? option?.dishes[0] && dispatch({ type: 'pickCourse', day, dish: option.dishes[0] })
            : dispatch({ type: 'decide', day, action, option })
        }
      />
    </>
  );
}
