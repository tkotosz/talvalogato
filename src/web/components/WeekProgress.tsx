import { Check } from 'lucide-react';
import { days } from '../../core/planning.ts';
import type { Day, Plan } from '../../core/types.ts';
import { shortDays } from '../format.ts';

/** The day strip: selected days with their decisions, and days Teletál no longer takes orders for disabled. */
export function WeekProgress({ plan, eligible, onSelect }: { plan: Plan; eligible: Day[]; onSelect(day: Day): void }) {
  return (
    <ol aria-label="A heti válogatás állása" className="week-progress">
      {plan.selectedDays.map(dayNumber => {
        const day = days[dayNumber - 1];
        const available = eligible.includes(dayNumber);
        const active = plan.day === dayNumber;
        const done = available && Object.hasOwn(plan.slots, dayNumber);
        const picked = done && Boolean(plan.slots[dayNumber]);
        return (
          <li key={day}>
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              disabled={!available}
              aria-label={`${day}${!available ? ', nem rendelhető' : done ? (picked ? ', étel kiválasztva' : ', kihagyva') : ''}`}
              className={done ? (picked ? 'picked' : 'skipped') : undefined}
              onClick={() => onSelect(dayNumber)}
            >
              {picked && <Check size={13} aria-hidden="true" />}
              <span>{shortDays[dayNumber - 1]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
