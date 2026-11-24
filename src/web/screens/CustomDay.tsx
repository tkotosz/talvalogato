import { Check, ChevronRight, Eraser, Flame, Minus, Plus, Sparkles, Utensils, Wallet, X } from 'lucide-react';
import {
  canGenerate,
  courseDeck,
  pickedDishes,
  remainingCalories,
  remainingMoney,
  rowChoiceCounts,
  totalCalories,
  totalPrice,
  trayCourseNames,
  trayCourses,
} from '../../core/custom.ts';
import { allergenList, dishAllergens } from '../../core/filters.ts';
import type { PlannerAction } from '../../core/planner.ts';
import { calorieLimit, dayCandidates, menuCourseNames, splitDishName } from '../../core/planning.ts';
import type { CustomDraft, Day, Dish, Plan, Preferences, TrayCourse, WeekKey } from '../../core/types.ts';
import { ActiveFilters } from '../components/FilterNotes.tsx';
import { GeneratedDeck } from '../components/GeneratedDeck.tsx';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { calories, money } from '../format.ts';

/** Rows picked by swiping, where choosing is the point; the other rows are picked from a list. */
const swipedCourses: TrayCourse[] = ['menu', 'soup', 'main'];
const nouns = (course: TrayCourse) =>
  course === 'menu' ? { missing: 'menühöz', again: 'Menük újranézése' } : { missing: 'ételhez', again: 'Ételek újranézése' };

/** Names for running text, such as "teletál menü, ital". */
const lowerNames = (courses: TrayCourse[]) => courses.map(course => trayCourseNames[course].toLocaleLowerCase('hu')).join(', ');

/**
 * The day's tray: its rows of set menus and dishes, the buttons that add empty rows, and what the rows add up to. A row
 * opens its deck or list, and an idea fills every empty row.
 */
function Tray({
  draft,
  candidates,
  preferences,
  onOpen,
  onAdd,
  onEmpty,
  onRemove,
  onGenerate,
  onSave,
  onClear,
  onOpenSettings,
}: {
  draft: CustomDraft;
  /** The day's dishes, to tell which kinds of rows have anything to offer. */
  candidates: Dish[];
  preferences: Preferences;
  onOpen(row: number): void;
  onAdd(course: TrayCourse): void;
  /** Takes the dish off a row, keeping the row. */
  onEmpty(row: number): void;
  /** Takes an empty row off the tray. */
  onRemove(row: number): void;
  /** Asks for an idea for the empty rows. */
  onGenerate(): void;
  /** Saves the tray and shows the finished day. */
  onSave(): void;
  /** Takes everything off the tray, and the day's saved menu with it. */
  onClear(): void;
  onOpenSettings(): void;
}) {
  const dishes = pickedDishes(draft);
  const total = totalCalories(dishes);
  const limit = preferences.limitCalories ? calorieLimit(preferences) : null;
  const overLimit = limit !== null && total !== null && total > limit;
  const menuHasDessert = dishes.some(dish => !dish.course && dish.components?.some(course => course.kind === 'dessert'));
  const empty = draft.rows.filter(row => !row.dish).map(row => row.course);
  // A kind of row with nothing to offer today is not a dead end: its button is off, and a note says why.
  const counts = rowChoiceCounts(candidates, preferences);
  const filteredOut = trayCourses.filter(course => !counts.allowed[course] && counts.available[course]);
  const missingToday = trayCourses.filter(course => !counts.available[course]);
  return (
    <section className="custom-step">
      <h2>A nap menüje</h2>
      <p className="custom-hint">
        {draft.rows.length
          ? 'Koppints egy sorra a választáshoz vagy a cseréhez.'
          : 'Add hozzá, miből álljon a napod: Teletál menüt, levest, főételt vagy bármi mást, akár többet is.'}
      </p>
      {/* At least two rows tall, so the tray keeps its shape from empty to the second row. */}
      <div className="tray-rows">
        {draft.rows.length === 0 && (
          <div className="tray-empty">
            <Utensils size={22} aria-hidden="true" />
            <span>Még üres a napod</span>
          </div>
        )}
        {draft.rows.length > 0 && (
          <ul className="custom-summary">
            {draft.rows.map(({ course, dish }, index) => {
              const label = trayCourseNames[course];
              return (
                <li key={index} className={course === 'menu' ? 'tray-row tray-row-menu' : 'tray-row'}>
                  <button type="button" onClick={() => onOpen(index)}>
                    <strong>{label}</strong>
                    <span className={dish ? undefined : 'custom-empty'} lang="hu">
                      {!dish ? (
                        'Nincs kiválasztva'
                      ) : course === 'menu' ? (
                        // The code in its own column, so the courses line up under the menu name.
                        <span className="tray-menu">
                          <span className="meal-code">{dish.code}</span>
                          <span>
                            {dish.menuName}
                            <small className="tray-menu-courses">
                              {menuCourseNames(dish).map((name, part) => (
                                <span key={part}>{name}</span>
                              ))}
                            </small>
                          </span>
                        </span>
                      ) : (
                        <>
                          <span className="meal-code">{dish.code}</span> {dish.name}
                        </>
                      )}
                    </span>
                    <span>
                      {dish ? (
                        `${calories(dish.kcal)} · ${money(dish.price)}`
                      ) : (
                        <ChevronRight size={16} aria-label="Kiválasztás" />
                      )}
                    </span>
                  </button>
                  {dish ? (
                    <button
                      type="button"
                      className="tray-remove"
                      aria-label={`${label} ürítése`}
                      title="Ürítés"
                      onClick={() => onEmpty(index)}
                    >
                      <Eraser size={17} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tray-remove"
                      aria-label={`${label} eltávolítása`}
                      title="Eltávolítás"
                      onClick={() => onRemove(index)}
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {canGenerate(draft) && (
        <div className="tray-idea">
          <button type="button" className="button secondary" onClick={onGenerate}>
            <Sparkles size={17} aria-hidden="true" /> Dobj egy ötletet
          </button>
          <p className="custom-hint">Kitöltjük az üres sorokat: {lowerNames(empty)}. Kérhetsz másikat is.</p>
        </div>
      )}
      <div className="tray-add">
        <h3>Hozzáadás</h3>
        <div className="course-choices-grid">
          {trayCourses.map(course => (
            <button key={course} type="button" disabled={!counts.allowed[course]} onClick={() => onAdd(course)}>
              <Plus size={16} aria-hidden="true" />
              {trayCourseNames[course]}
              {course === 'dessert' && menuHasDessert && <small>a menüben van</small>}
            </button>
          ))}
        </div>
        {filteredOut.length > 0 && (
          <div className="tray-unavailable">
            <p className="custom-hint">A beállításaid miatt ma nem választható: {lowerNames(filteredOut)}.</p>
            <ActiveFilters preferences={preferences} onOpenSettings={onOpenSettings} />
          </div>
        )}
        {missingToday.length > 0 && <p className="custom-hint">Ezen a napon nincs: {lowerNames(missingToday)}.</p>}
      </div>
      <p className="custom-total" aria-live="polite">
        <span>Összesen</span>
        <strong>
          {dishes.length ? (total === null ? 'ismeretlen kcal' : calories(total)) : '–'} · {money(totalPrice(dishes))}
        </strong>
      </p>
      {/* The calorie line above the tray shows the limit; the note stays for a menu over it. */}
      {overLimit && <p className="over-limit-note">A menü {calories(total! - limit)} kalóriával a kereted felett van.</p>}
      <div className="tray-actions">
        <button type="button" className="button secondary" disabled={!draft.rows.length} onClick={onClear}>
          Törlés
        </button>
        <button type="button" className="button primary" disabled={!dishes.length} onClick={onSave}>
          Kész
        </button>
      </div>
    </section>
  );
}

/**
 * The day's tray and what it opens: the tray itself, the deck or list of one of its rows, or an idea waiting to be kept.
 * A day without a tray yet shows an empty one; its first row starts it.
 */
export function CustomDay({
  plan,
  day,
  draft,
  catalog,
  preferences,
  money: dayMoney,
  teletalWeek,
  dispatch,
  onOpenSettings,
}: {
  plan: Plan;
  day: Day;
  draft: CustomDraft;
  catalog: Dish[];
  preferences: Preferences;
  /** What the weekly spending limit leaves for the day, or null without a limit. */
  money: number | null;
  /** The week whose Teletál menu the cards link to, or null for no links. */
  teletalWeek: WeekKey | null;
  dispatch(action: PlannerAction): void;
  onOpenSettings(): void;
}) {
  const { stage } = draft;
  if (stage === 'generated') {
    return (
      <GeneratedDeck
        day={day}
        draft={draft}
        catalog={catalog}
        preferences={preferences}
        money={dayMoney}
        onAccept={() => dispatch({ type: 'acceptGenerated', day })}
        onReject={() => dispatch({ type: 'rejectGenerated', day })}
        onLeave={() => dispatch({ type: 'cancelGenerated', day })}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  const row = typeof stage === 'number' ? draft.rows[stage] : undefined;
  if (!row) {
    return (
      <Tray
        draft={draft}
        candidates={dayCandidates(catalog, day)}
        preferences={preferences}
        onOpen={index => dispatch({ type: 'openStage', day, stage: index })}
        onAdd={course => dispatch({ type: 'addCourse', day, course })}
        onEmpty={index => dispatch({ type: 'emptyCourse', day, row: index })}
        onRemove={index => dispatch({ type: 'removeCourse', day, row: index })}
        // The seed makes every idea different; the reducer itself stays free of randomness.
        onGenerate={() => dispatch({ type: 'startGenerated', day, seed: Math.floor(Math.random() * 2 ** 32) })}
        onSave={() => dispatch({ type: 'saveTray', day })}
        onClear={() => dispatch({ type: 'clearDay', day })}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  const props = {
    plan,
    day,
    index: stage as number,
    course: row.course,
    draft,
    catalog,
    preferences,
    dayMoney,
    teletalWeek,
    dispatch,
    onOpenSettings,
  };
  return swipedCourses.includes(row.course) ? <RowDeck key={stage} {...props} /> : <ExtraList key={stage} {...props} />;
}

interface RowProps {
  plan: Plan;
  day: Day;
  /** The index of the open row on the tray. */
  index: number;
  course: TrayCourse;
  draft: CustomDraft;
  catalog: Dish[];
  preferences: Preferences;
  /** What the weekly spending limit leaves for the day, or null without a limit. */
  dayMoney: number | null;
  teletalWeek: WeekKey | null;
  dispatch(action: PlannerAction): void;
  onOpenSettings(): void;
}

/** The row's name, and what is left of the calorie limit and the spending limit for it. */
function RowHeading({ course, remaining, money: left }: { course: TrayCourse; remaining: number | null; money: number | null }) {
  return (
    <div className="picker-details course-details">
      <strong>{trayCourseNames[course]}</strong>
      {(remaining !== null || left !== null) && (
        <span className="row-budgets">
          {remaining !== null && (
            <span className="day-budget">
              <Flame size={18} aria-hidden="true" /> Még {calories(Math.max(0, remaining))}
            </span>
          )}
          {left !== null && (
            <span className="day-budget">
              <Wallet size={18} aria-hidden="true" /> Még {money(Math.max(0, left))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** Why a row offers nothing: a limit, with a way past it, or no dish today or the settings' filters. */
function NothingToOffer({
  course,
  draft,
  overLimitCount,
  remaining,
  money: left,
  preferences,
  onShowOverLimit,
  onOpenSettings,
}: {
  course: TrayCourse;
  draft: CustomDraft;
  overLimitCount: number;
  remaining: number | null;
  money: number | null;
  preferences: Preferences;
  onShowOverLimit(): void;
  onOpenSettings(): void;
}) {
  return overLimitCount > 0 && !draft.overLimit.includes(course) ? (
    <>
      <span className="section-icon">
        <Minus size={25} />
      </span>
      <h2>Nincs a keretbe férő választás</h2>
      {remaining !== null && <p>A kalóriakeretedből {calories(Math.max(0, remaining))} maradt erre a sorra.</p>}
      {left !== null && <p>A heti költségkeretedből {money(Math.max(0, left))} maradt erre a sorra.</p>}
      <button type="button" className="button secondary" onClick={onShowOverLimit}>
        Mutasd a kereten felülieket is
      </button>
    </>
  ) : (
    <>
      <h2>Nincs választható {course === 'menu' ? 'menü' : 'étel'}</h2>
      <p>Ebből ma nincs rendelhető, vagy a szűrőid mindet kizárják.</p>
      <ActiveFilters preferences={preferences} onOpenSettings={onOpenSettings} />
    </>
  );
}

/** A set menu, soup or main: a swipe deck, where right puts the card on the row. */
function RowDeck({
  plan,
  day,
  index,
  course,
  draft,
  catalog,
  preferences,
  dayMoney,
  teletalWeek,
  dispatch,
  onOpenSettings,
}: RowProps) {
  const remaining = remainingCalories(draft, preferences, index);
  const left = remainingMoney(draft, index, dayMoney);
  return (
    <>
      <RowHeading course={course} remaining={remaining} money={left} />
      <SwipeDeck
        plan={plan}
        day={day}
        candidates={dayCandidates(catalog, day)}
        buildOptions={loaded => courseDeck(loaded, draft, index, preferences, dayMoney).options}
        target={remaining}
        priceTarget={left}
        teletalWeek={teletalWeek}
        nouns={nouns(course)}
        empty={loaded => (
          <NothingToOffer
            course={course}
            draft={draft}
            overLimitCount={courseDeck(loaded, draft, index, preferences, dayMoney).overLimitCount}
            remaining={remaining}
            money={left}
            preferences={preferences}
            onShowOverLimit={() => dispatch({ type: 'showOverLimit', day })}
            onOpenSettings={onOpenSettings}
          />
        )}
        onAction={(action, option) =>
          action === 'right'
            ? option?.dishes[0] && dispatch({ type: 'pickCourse', day, dish: option.dishes[0] })
            : dispatch({ type: 'decide', day, action, option })
        }
      />
    </>
  );
}

/** An extra: a list of the day's dishes, where a tap puts one on the row. */
function ExtraList({ day, index, course, draft, catalog, preferences, dayMoney, dispatch, onOpenSettings }: RowProps) {
  const {
    options,
    remaining,
    money: left,
    overLimitCount,
  } = courseDeck(dayCandidates(catalog, day), draft, index, preferences, dayMoney);
  const picked = draft.rows[index]?.dish;
  const canShowMore = overLimitCount > 0 && !draft.overLimit.includes(course);
  return (
    <>
      <RowHeading course={course} remaining={remaining} money={left} />
      {options.length ? (
        <ul className="extra-list" aria-label={trayCourseNames[course]}>
          {options.map(option => {
            const dish = option.dishes[0]!;
            const { title, description } = splitDishName(dish.name);
            const allergens = dishAllergens(dish);
            const chosen = picked?.id === dish.id;
            return (
              <li key={option.id}>
                <button type="button" aria-pressed={chosen} onClick={() => dispatch({ type: 'pickCourse', day, dish })}>
                  <span className="extra-text" lang="hu">
                    <span className="extra-name">
                      <span className="meal-code">{dish.code}</span> {title}
                    </span>
                    {description && <span className="extra-detail">{description}</span>}
                    <span className="extra-detail">
                      Allergének:{' '}
                      {allergens === null ? 'nincs adat' : allergens.length ? allergenList(allergens) : 'nincs feltüntetve'}
                    </span>
                  </span>
                  <span className="extra-numbers">
                    <span>{calories(dish.kcal)}</span>
                    <span>{money(dish.price)}</span>
                  </span>
                  <span className="extra-action" aria-hidden="true">
                    {chosen ? <Check size={18} /> : <Plus size={18} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="placeholder-card" role="status">
          <NothingToOffer
            course={course}
            draft={draft}
            overLimitCount={overLimitCount}
            remaining={remaining}
            money={left}
            preferences={preferences}
            onShowOverLimit={() => dispatch({ type: 'showOverLimit', day })}
            onOpenSettings={onOpenSettings}
          />
        </div>
      )}
      {options.length > 0 && canShowMore && (
        <button type="button" className="button secondary wide" onClick={() => dispatch({ type: 'showOverLimit', day })}>
          Mutasd a kereten felülieket is ({overLimitCount})
        </button>
      )}
    </>
  );
}
