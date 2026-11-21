import { CalendarDays, Check, ChevronDown, Soup, Utensils } from 'lucide-react';
import type { PlannerAction, PlannerView } from '../../core/planner.ts';
import type { CatalogDish, PublishedWeek, WeekKey } from '../../core/types.ts';
import { longWeekLabel } from '../../core/weeks.ts';
import { DayChoices } from '../components/DayChoices.tsx';
import type { Loadable } from '../useLoad.ts';

/** Step 1: choose the delivery week and its days. The step bar's Tovább button submits this form. */
export function WeekScreen({
  view,
  weeks,
  weekError,
  catalog,
  dispatch,
  onRetryWeeks,
  onRetryCatalog,
}: {
  view: PlannerView;
  weeks: PublishedWeek[];
  weekError: string;
  catalog: Loadable<CatalogDish[]>;
  dispatch(action: PlannerAction): void;
  onRetryWeeks(): void;
  onRetryCatalog(): void;
}) {
  const { week, availableDays, selectedDays, eligible } = view;
  const selectWeek = (key: WeekKey) => dispatch({ type: 'chooseWeek', week: key });
  return (
    <main className="setup">
      <div className="setup-grid">
        <section className="welcome">
          <div className="welcome-copy">
            <h1>Tervezd meg a heti menüdet!</h1>
            <p>Válassz hetet, majd válogass a Teletál ebédmenüi és egész napos menüi közül.</p>
          </div>
          <div className="deck-art" aria-hidden="true">
            <div className="art-card art-card-left">
              <Soup size={40} strokeWidth={1.4} />
            </div>
            <div className="art-card art-card-right">
              <CalendarDays size={42} strokeWidth={1.4} />
            </div>
            <div className="art-card art-card-front">
              <span className="art-plate">
                <Utensils size={44} strokeWidth={1.55} />
              </span>
              <span className="art-lines">
                <i />
                <i />
              </span>
              <span className="art-check">
                <Check size={23} strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </section>
        <form
          id="week-selection"
          className="settings-card week-card"
          onSubmit={event => {
            event.preventDefault();
            if (eligible.length && catalog.phase === 'ready') dispatch({ type: 'navigate', step: 'meals' });
          }}
        >
          <div className="settings-heading">
            <span className="section-icon">
              <CalendarDays size={21} />
            </span>
            <h2>Hét kiválasztása</h2>
          </div>
          <label htmlFor="week">Kiszállítás hete</label>
          <div className="select-wrap">
            <CalendarDays size={18} aria-hidden="true" />
            <select id="week" value={week} disabled={!weeks.length} onChange={event => selectWeek(event.target.value)}>
              {!week && <option value="">{weekError ? 'A hetek nem érhetők el' : 'Hetek betöltése…'}</option>}
              {weeks.map(({ key }) => (
                <option key={key} value={key}>
                  {longWeekLabel(key)}
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </div>
          {week && (
            <DayChoices
              label="Rendelési napok"
              selected={selectedDays}
              available={availableDays}
              onChange={days => dispatch({ type: 'setWeekDays', days })}
            />
          )}
          {weekError && (
            <div className="form-error" role="alert">
              {weekError}
              <button type="button" className="text-button" onClick={onRetryWeeks}>
                Újra
              </button>
            </div>
          )}
          {week && catalog.phase === 'loading' && <p role="status">Rendelhető napok ellenőrzése…</p>}
          {catalog.phase === 'error' && (
            <div className="form-error" role="alert">
              {catalog.message}
              <button type="button" className="text-button" onClick={onRetryCatalog}>
                Újra
              </button>
            </div>
          )}
          {week && catalog.phase === 'ready' && !eligible.length && (
            <p role="status">
              {availableDays.length ? 'Válassz legalább egy rendelhető napot.' : 'Erre a hétre már nem rendelhetsz.'}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
