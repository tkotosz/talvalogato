import { allDays, days } from '../../core/planning.ts';
import type { Day } from '../../core/types.ts';
import { shortDays } from '../format.ts';

export function DayChoices({
  label,
  selected,
  available = allDays,
  onChange,
}: {
  label: string;
  selected: Day[];
  available?: Day[];
  onChange(days: Day[]): void;
}) {
  return (
    <fieldset className="day-choices">
      <legend>{label}</legend>
      <div className="day-choices-grid">
        {allDays.map(day => {
          const disabled = !available.includes(day);
          const pressed = !disabled && selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-label={disabled ? `${days[day - 1]}, nem rendelhető` : days[day - 1]}
              aria-pressed={pressed}
              disabled={disabled}
              onClick={() => onChange(allDays.filter(value => (value === day ? !pressed : selected.includes(value))))}
            >
              {shortDays[day - 1]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
