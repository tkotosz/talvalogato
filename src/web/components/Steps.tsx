import { ShoppingBasket } from 'lucide-react';
import type { Step } from '../../core/planner.ts';

const steps: [Step, string][] = [['week', 'Hét'], ['meals', 'Ételek'], ['overview', 'Áttekintés']];

export function StepProgress({ step, onNavigate }: { step: Step; onNavigate(step: Step): void }) {
  return <nav className="step-progress" aria-label="Tervezési lépések">
    <ol>
      {steps.map(([id, label], index) =>
        <li key={id}>
          <button className="step-link" type="button" aria-current={step === id ? 'step' : undefined} onClick={() => onNavigate(id)}>
            <span className="step-number" aria-hidden="true">{index + 1}</span>{label}
          </button>
        </li>)}
    </ol>
  </nav>;
}

export interface DayAction {
  label: string;
  onClick(): void;
}

/** The bottom bar. On the week step its main button submits the week form. */
export function StepBar({ step, disabled, onBack, dayAction, onNext }: {
  step: Step;
  disabled: boolean;
  onBack(): void;
  dayAction: DayAction | null;
  onNext(): void;
}) {
  const selectingWeek = step === 'week';
  const overview = step === 'overview';
  return <footer className="step-bar" data-step={step}>
    <div className={dayAction ? 'step-bar-inner has-day-action' : 'step-bar-inner'}>
      {!selectingWeek && <button type="button" className="button secondary" onClick={onBack}>Vissza</button>}
      {dayAction && <button type="button" className="button secondary" onClick={dayAction.onClick}>{dayAction.label}</button>}
      <button className="button primary" type={selectingWeek ? 'submit' : 'button'} disabled={disabled}
        form={selectingWeek ? 'week-selection' : undefined} onClick={selectingWeek ? undefined : onNext}>
        {overview && <ShoppingBasket size={19} aria-hidden="true" />}
        {overview ? 'Kosárhoz adás' : 'Tovább'}
      </button>
    </div>
  </footer>;
}
