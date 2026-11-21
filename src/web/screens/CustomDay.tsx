import { useState } from 'react';
import { Check, Flame, Minus, Plus } from 'lucide-react';
import { courseNames, mealCourses, sideCourses } from '../../core/courses.ts';
import { caloriesLeft, chosenCourses, courseDeck, pickedDishes, remainingCalories, totalCalories } from '../../core/custom.ts';
import type { PlannerAction } from '../../core/planner.ts';
import { dayCandidates } from '../../core/planning.ts';
import type { CatalogDish, CustomCourse, CustomDraft, Day, Plan, Preferences } from '../../core/types.ts';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { calories, money, number } from '../format.ts';

const courseNouns = { checked: 'étel', missing: 'ételhez', again: 'Ételek újranézése' };

/** The day's stages as a strip: the meal checklist, each chosen course, and the side-course step. */
function CourseStrip({ draft, onOpen }: { draft: CustomDraft; onOpen(stage: CustomDraft['stage']): void }) {
  const sidesOpen = draft.sideCourses !== null || draft.stage === 'sides';
  const item = (stage: CustomDraft['stage'], label: string, status?: 'picked' | 'skipped') => (
    <li key={stage}>
      <button
        type="button"
        aria-current={draft.stage === stage ? 'step' : undefined}
        className={status}
        onClick={() => onOpen(stage)}
        aria-label={`${label}${status === 'picked' ? ', kiválasztva' : status === 'skipped' ? ', kihagyva' : ''}`}
      >
        {status === 'picked' && <Check size={13} aria-hidden="true" />}
        <span>{label}</span>
      </button>
    </li>
  );
  const status = (course: CustomCourse) =>
    draft.picks[course] ? ('picked' as const) : draft.picks[course] === null ? ('skipped' as const) : undefined;
  return (
    <ol className="course-strip" aria-label="A saját menü lépései">
      {draft.editing && item('summary', 'Összegzés')}
      {item('meals', 'Fogások')}
      {draft.mealCourses.map(course => item(course, courseNames[course], status(course)))}
      {sidesOpen && item('sides', 'Mellé')}
      {(draft.sideCourses ?? []).map(course => item(course, courseNames[course], status(course)))}
    </ol>
  );
}

/** Toggle buttons for a set of courses. */
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
              onClick={() => onChange(courses.filter(value => (value === course ? !pressed : selected.includes(value))))}
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

function MealChecklist({ draft, onDone }: { draft: CustomDraft; onDone(courses: CustomCourse[]): void }) {
  const [selected, setSelected] = useState(draft.mealCourses);
  return (
    <section className="custom-step">
      <h2>Miből álljon a menü?</h2>
      <CourseChoices label="Fogások" courses={mealCourses} selected={selected} onChange={setSelected} />
      <p className="custom-hint">Savanyúságot, cipót, desszertet és italt a főétel után választhatsz.</p>
      <button type="button" className="button primary wide" onClick={() => onDone(selected)}>
        Tovább
      </button>
    </section>
  );
}

function SideCourses({
  draft,
  remaining,
  onDone,
}: {
  draft: CustomDraft;
  remaining: number | null;
  onDone(courses: CustomCourse[]): void;
}) {
  const [selected, setSelected] = useState<CustomCourse[]>(draft.sideCourses ?? []);
  const dishes = pickedDishes({ ...draft, sideCourses: [] });
  return (
    <section className="custom-step">
      <h2>Kérsz még valamit mellé?</h2>
      {dishes.length > 0 && (
        <ul className="custom-picks">
          {dishes.map(dish => (
            <li key={dish.id}>
              <span>{dish.course ? courseNames[dish.course] : ''}</span> {dish.name}
            </li>
          ))}
        </ul>
      )}
      {remaining !== null && <p className="custom-hint">A kalóriakeretedből még {calories(Math.max(0, remaining))} maradt.</p>}
      <CourseChoices label="Mellé" courses={sideCourses} selected={selected} onChange={setSelected} />
      <div className="custom-actions">
        <button type="button" className="button secondary" onClick={() => onDone([])}>
          Nem, köszönöm
        </button>
        <button type="button" className="button primary" disabled={!selected.length} onClick={() => onDone(selected)}>
          Tovább
        </button>
      </div>
    </section>
  );
}

/** The summary of a custom day being edited: each course with its dish; a course opens its deck. */
function CustomSummary({ draft, onOpen }: { draft: CustomDraft; onOpen(course: CustomCourse): void }) {
  return (
    <section className="custom-step">
      <h2>Saját menü szerkesztése</h2>
      <p className="custom-hint">Koppints egy fogásra a cseréjéhez, majd mentsd a menüt.</p>
      <ul className="custom-summary">
        {chosenCourses(draft).map(course => {
          const dish = draft.picks[course];
          return (
            <li key={course}>
              <button type="button" onClick={() => onOpen(course)}>
                <strong>{courseNames[course]}</strong>
                <span>{dish ? dish.name : dish === null ? 'Kihagyva' : 'Nincs kiválasztva'}</span>
                {dish && <span>{calories(dish.kcal)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Step 2 for a custom day: the meal checklist, one deck per course, and the side-course step. */
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
  catalog: CatalogDish[];
  preferences: Preferences;
  dispatch(action: PlannerAction): void;
}) {
  const { stage } = draft;
  const dishes = pickedDishes(draft);
  const total = totalCalories(dishes);
  const price = dishes.reduce((sum, dish) => sum + dish.price, 0);

  return (
    <>
      <CourseStrip draft={draft} onOpen={next => dispatch({ type: 'openStage', day, stage: next })} />
      <p className="custom-total" aria-live="polite">
        {dishes.length ? (
          <>
            {number.format(dishes.length)} étel · {total === null ? 'ismeretlen kcal' : calories(total)} · {money(price)}
          </>
        ) : (
          'Még nincs kiválasztott étel'
        )}
      </p>
      {stage === 'meals' ? (
        <MealChecklist key="meals" draft={draft} onDone={courses => dispatch({ type: 'setMealCourses', day, courses })} />
      ) : stage === 'sides' ? (
        <SideCourses
          key="sides"
          draft={draft}
          remaining={caloriesLeft(draft, preferences)}
          onDone={courses => dispatch({ type: 'setSideCourses', day, courses })}
        />
      ) : stage === 'summary' ? (
        <CustomSummary draft={draft} onOpen={next => dispatch({ type: 'openStage', day, stage: next })} />
      ) : (
        <CourseDeck
          key={stage}
          plan={plan}
          day={day}
          course={stage}
          draft={draft}
          catalog={catalog}
          preferences={preferences}
          remaining={remainingCalories(draft, preferences, stage)}
          dispatch={dispatch}
        />
      )}
    </>
  );
}

function CourseDeck({
  plan,
  day,
  course,
  draft,
  catalog,
  preferences,
  remaining,
  dispatch,
}: {
  plan: Plan;
  day: Day;
  course: CustomCourse;
  draft: CustomDraft;
  catalog: CatalogDish[];
  preferences: Preferences;
  remaining: number | null;
  dispatch(action: PlannerAction): void;
}) {
  const candidates = dayCandidates(catalog, day).filter(dish => dish.course === course);
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
        deckKey={`course:${course}`}
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
              <p>Ebben a fogásban ma nincs rendelhető étel, vagy a szűrőid mindet kizárják.</p>
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
