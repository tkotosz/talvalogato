import { useRef } from 'react';
import { Check, ListChecks, RefreshCw, Utensils } from 'lucide-react';
import { customOption, ideaFilled, pickedDishes, totalCalories, totalPrice, trayCourseNames } from '../../core/custom.ts';
import { generationProblem } from '../../core/generate.ts';
import { calorieLimit, dayCandidates } from '../../core/planning.ts';
import type { CustomDraft, Day, Dish, Preferences } from '../../core/types.ts';
import { calories, money } from '../format.ts';
import { CustomMenuCard } from './CustomMenuCard.tsx';
import { ActiveFilters } from './FilterNotes.tsx';
import { useSwipeKeys } from './SwipeDeck.tsx';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from './SwipeCard.tsx';

const actions: { direction: SwipeDirection; label: string; Icon: typeof Check }[] = [
  { direction: 'left', label: 'Másikat kérek', Icon: RefreshCw },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const keys: Record<string, SwipeDirection> = { ArrowLeft: 'left', ArrowRight: 'right' };

/** An idea for the tray's empty rows, shown with the rest of the tray: right keeps it, left asks for another one. */
export function GeneratedDeck({
  day,
  draft,
  catalog,
  preferences,
  money: dayMoney,
  onAccept,
  onReject,
  onLeave,
  onOpenSettings,
}: {
  day: Day;
  draft: CustomDraft;
  catalog: Dish[];
  preferences: Preferences;
  /** What the weekly spending limit leaves for the day, or null without a limit. */
  money: number | null;
  onAccept(): void;
  onReject(): void;
  /** Back to the tray as it was before the idea. */
  onLeave(): void;
  onOpenSettings(): void;
}) {
  const card = useRef<SwipeCardHandle>(null);
  const option = customOption(draft, preferences);
  // The rows the idea fills, by index.
  const filled = draft.generator?.rows ?? [];
  useSwipeKeys(card, option !== null, keys);
  const limit = preferences.limitCalories ? calorieLimit(preferences) : null;

  // An idea that filled no row has nothing to keep, even when the rest of the tray has dishes.
  if (!option || !ideaFilled(draft)) {
    // Nothing was filled: everything on the tray was there before the idea.
    const kept = pickedDishes(draft);
    const left = dayMoney === null ? null : dayMoney - totalPrice(kept);
    const used = totalCalories(kept) ?? 0;
    const problem = generationProblem(
      dayCandidates(catalog, day),
      filled.map(index => draft.rows[index]!.course),
      preferences,
      used,
      left,
    );
    return (
      <div className="deck">
        <div className="placeholder-card" role="status">
          <span className="section-icon">
            <Utensils size={25} />
          </span>
          {problem === 'calories' ? (
            <>
              <h2>Nincs a keretbe férő menü</h2>
              <p>
                A napi kalóriakeretedből {calories(Math.max(0, (limit ?? 0) - used))} maradt a menü többi része mellett, és ebből
                nem jön ki ötlet. Válassz magad, vagy emeld a keretet a beállításokban.
              </p>
            </>
          ) : problem === 'money' ? (
            <>
              <h2>Nincs a keretbe férő menü</h2>
              <p>
                A heti költségkeretedből {money(Math.max(0, left ?? 0))} maradt a menü többi része mellett, és ebből nem jön ki
                ötlet. Válassz magad, vagy emeld a keretet a beállításokban.
              </p>
            </>
          ) : (
            <>
              <h2>Nincs választható étel</h2>
              <p>Ma nincs rendelhető leves vagy főétel, vagy a szűrőid mindet kizárják.</p>
              <ActiveFilters preferences={preferences} onOpenSettings={onOpenSettings} />
            </>
          )}
          <button type="button" className="button secondary" onClick={onLeave}>
            <ListChecks size={17} /> Vissza a menühöz
          </button>
        </div>
      </div>
    );
  }

  // Components without any dish today are left out of the menu.
  const missing = filled.flatMap(index => (draft.rows[index]?.dish ? [] : [draft.rows[index]!.course]));
  return (
    <>
      <div className="deck">
        <div className="card-backing" aria-hidden="true" />
        <SwipeCard
          // Every new menu advances the seed, so each one gets a fresh card.
          key={draft.generator?.seed}
          ref={card}
          actions={actions}
          onAction={direction => (direction === 'right' ? onAccept() : direction === 'left' && onReject())}
        >
          <CustomMenuCard option={option} target={limit} generated />
        </SwipeCard>
      </div>
      <div className="deck-actions" aria-label="Ötlet megtartása vagy cseréje">
        {actions.map(({ direction, label, Icon }) => (
          <button
            type="button"
            key={direction}
            className={'decision decision-' + direction}
            onClick={() => card.current?.swipe(direction)}
          >
            <span className="decision-icon">
              <Icon size={23} strokeWidth={2.2} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="nutrition-note">Ma nincs választható: {missing.map(course => trayCourseNames[course]).join(', ')}.</p>
      )}
    </>
  );
}
