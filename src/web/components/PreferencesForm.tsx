import { useState } from 'react';
import { Flame, Wallet } from 'lucide-react';
import { calorieLimit, restorePreferences, validCalorieBudget, validWeeklyBudget } from '../../core/planning.ts';
import type { Preferences, WeekKey } from '../../core/types.ts';
import { calories, money } from '../format.ts';
import { CodeFilter } from './CodeFilter.tsx';
import { DietChoice, DietFilters } from './DietFilters.tsx';

/** Preferences while being edited: a number field can be empty. */
type Draft = Omit<Preferences, 'calories' | 'tolerance' | 'weeklyBudget'> & {
  calories: number | '';
  tolerance: number | '';
  weeklyBudget: number | '';
};

const numberValue = (input: HTMLInputElement) => (input.value === '' ? '' : input.valueAsNumber);

export function PreferencesForm({
  preferences,
  week,
  demo,
  onSave,
}: {
  preferences: Preferences;
  /** The week whose catalog lists the menu codes, or empty while weeks load. */
  week: WeekKey;
  /** The menu is the invented demo. */
  demo: boolean;
  onSave(preferences: Preferences): void;
}) {
  const [draft, setDraft] = useState<Draft>(preferences);
  const change = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft(current => ({ ...current, [key]: value }));
  const validBudget = validCalorieBudget(draft);
  const validSpending = validWeeklyBudget(draft);
  const canSave = (!draft.limitCalories || validBudget) && (!draft.limitSpending || validSpending);
  return (
    <form
      className="preferences-form"
      onSubmit={event => {
        event.preventDefault();
        if (canSave) onSave(restorePreferences(draft));
      }}
    >
      <DietChoice value={draft.diet} onChange={diet => change('diet', diet)} />
      <label className="preference-toggle">
        <input type="checkbox" checked={draft.limitCalories} onChange={event => change('limitCalories', event.target.checked)} />
        Napi kalóriakeret
      </label>
      {draft.limitCalories && (
        <>
          <div className="number-fields">
            <label htmlFor="target">
              Napi kalóriacél
              <span className="field-wrap">
                <input
                  id="target"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  required
                  value={draft.calories}
                  onChange={event => change('calories', numberValue(event.target))}
                />
                <span>kcal</span>
              </span>
            </label>
            <label htmlFor="tolerance">
              Ráhagyás
              <span className="field-wrap">
                <input
                  id="tolerance"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="any"
                  required
                  value={draft.tolerance}
                  onChange={event => change('tolerance', numberValue(event.target))}
                />
                <span>%</span>
              </span>
            </label>
          </div>
          {validBudget ? (
            <div className="budget-note">
              <Flame size={19} aria-hidden="true" />
              <strong>Naponta legfeljebb {calories(calorieLimit(draft as Preferences))}</strong>
            </div>
          ) : (
            <p className="form-error" role="status">
              Adj meg egy pozitív egész kalóriacélt és 0–100% ráhagyást.
            </p>
          )}
        </>
      )}
      <label className="preference-toggle">
        <input type="checkbox" checked={draft.limitSpending} onChange={event => change('limitSpending', event.target.checked)} />
        Heti költségkeret
      </label>
      {draft.limitSpending && (
        <>
          <div className="number-fields">
            <label htmlFor="weekly-budget">
              Egy hétre legfeljebb
              <span className="field-wrap">
                <input
                  id="weekly-budget"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  required
                  value={draft.weeklyBudget}
                  onChange={event => change('weeklyBudget', numberValue(event.target))}
                />
                <span>Ft</span>
              </span>
            </label>
          </div>
          {validSpending ? (
            <div className="budget-note">
              <Wallet size={19} aria-hidden="true" />
              <strong>
                Hetente legfeljebb {money(draft.weeklyBudget as number)}. A kereten felüli ételeket kérésre megmutatjuk.
              </strong>
            </div>
          ) : (
            <p className="form-error" role="status">
              Adj meg egy pozitív egész összeget forintban.
            </p>
          )}
        </>
      )}
      <label className="preference-toggle">
        <input type="checkbox" checked={draft.filterCodes} onChange={event => change('filterCodes', event.target.checked)} />
        Teletál-kódok szűrése
      </label>
      {draft.filterCodes &&
        (week ? (
          <CodeFilter week={week} excludedCodes={draft.excludedCodes} onChange={codes => change('excludedCodes', codes)} />
        ) : (
          <p role="status">A kódlista az elérhető hetek betöltése után jelenik meg.</p>
        ))}
      <DietFilters value={draft} onChange={changes => setDraft(current => ({ ...current, ...changes }))} demo={demo} />
      <div className="modal-actions">
        <button type="submit" className="button primary" disabled={!canSave}>
          Mentés
        </button>
      </div>
    </form>
  );
}
