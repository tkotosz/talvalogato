import { ChevronRight, Flame, Truck } from 'lucide-react';
import { emptyTray, trayCourseNames } from '../../core/custom.ts';
import type { PlannerAction } from '../../core/planner.ts';
import { calorieLimit, days, selectionIssue } from '../../core/planning.ts';
import type { CustomDraft, Day, Dish, Plan, Preferences, WeekKey } from '../../core/types.ts';
import { CustomMenuCard } from '../components/CustomMenuCard.tsx';
import { MealCard } from '../components/MealCard.tsx';
import { WeekProgress } from '../components/WeekProgress.tsx';
import { calories } from '../format.ts';
import { CustomDay } from './CustomDay.tsx';

/** Step 2: one day at a time, on the day's tray. A finished day shows its decision. */
export function MealsScreen({
  plan,
  day,
  eligible,
  catalog,
  preferences,
  done,
  custom,
  teletalWeek,
  dispatch,
  onOpenSettings,
}: {
  plan: Plan;
  day: Day;
  eligible: Day[];
  catalog: Dish[];
  preferences: Preferences;
  done: boolean;
  /** The day's tray in progress, or null before its first row. */
  custom: CustomDraft | null;
  /** The week whose Teletál menu the cards link to, or null for no links, as in the demo. */
  teletalWeek: WeekKey | null;
  dispatch(action: PlannerAction): void;
  onOpenSettings(): void;
}) {
  const picked = plan.slots[day];
  const budget = preferences.limitCalories ? calorieLimit(preferences) : null;
  const issue = done && picked && selectionIssue(picked, day, eligible, catalog, preferences);
  // The breadcrumb, while the tray has opened a row or an idea.
  const crumbs: { label: string; onClick?: () => void }[] = [];
  if (custom?.generator) {
    crumbs.push({ label: 'A nap menüje', onClick: () => dispatch({ type: 'cancelGenerated', day }) });
    crumbs.push({ label: 'Ötlet' });
  } else if (custom && typeof custom.stage === 'number' && custom.rows[custom.stage]) {
    crumbs.push({ label: 'A nap menüje', onClick: () => dispatch({ type: 'openStage', day, stage: 'overview' }) });
    crumbs.push({ label: trayCourseNames[custom.rows[custom.stage]!.course] });
  }

  return (
    <main className="picker" aria-label={`Napi válogatás · ${days[day - 1]}`}>
      <WeekProgress plan={{ ...plan, day }} eligible={eligible} onSelect={value => dispatch({ type: 'openDay', day: value })} />
      {!done && crumbs.length > 0 && (
        <nav className="day-steps" aria-label="A napi válogatás lépései">
          <ol>
            {crumbs.map(({ label, onClick }, index) => {
              const current = index === crumbs.length - 1;
              return (
                <li key={label} aria-current={current ? 'step' : undefined}>
                  {index > 0 && <ChevronRight size={15} aria-hidden="true" />}
                  {current || !onClick ? (
                    <span>{label}</span>
                  ) : (
                    <button type="button" onClick={onClick}>
                      {label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {/* Teletál delivers weekend meals with Friday's delivery. */}
      {day > 5 && (
        <p className="info-note" role="note">
          <Truck size={18} aria-hidden="true" />
          <span>A {day === 6 ? 'szombati' : 'vasárnapi'} ételek pénteken érkeznek, mert a Teletál hétvégén nem szállít.</span>
        </p>
      )}
      {budget !== null && custom?.generator && (
        <div className="picker-details">
          <span className="day-budget">
            <Flame size={18} aria-hidden="true" /> Max. {calories(budget)}
          </span>
        </div>
      )}
      {done ? (
        <>
          <div className="deck">
            {picked?.kind === 'custom' ? (
              <CustomMenuCard option={picked} target={budget} />
            ) : picked ? (
              <MealCard option={picked} target={budget} teletalWeek={teletalWeek} />
            ) : (
              <div className="placeholder-card">
                <h2>Kihagytad ezt a napot</h2>
              </div>
            )}
          </div>
          {issue && <p className="selection-issue completed-day-issue">{issue}</p>}
        </>
      ) : (
        <CustomDay
          plan={plan}
          day={day}
          draft={custom ?? emptyTray()}
          catalog={catalog}
          preferences={preferences}
          teletalWeek={teletalWeek}
          dispatch={dispatch}
          onOpenSettings={onOpenSettings}
        />
      )}
    </main>
  );
}
