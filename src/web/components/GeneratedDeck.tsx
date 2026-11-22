import { useRef } from 'react';
import { Check, ListChecks, RefreshCw, Utensils } from 'lucide-react';
import { courseNames } from '../../core/courses.ts';
import { customOption } from '../../core/custom.ts';
import { generationProblem } from '../../core/generate.ts';
import { calorieLimit, dayCandidates } from '../../core/planning.ts';
import type { CustomDraft, Day, Dish, Preferences } from '../../core/types.ts';
import { calories } from '../format.ts';
import { CustomMenuCard } from './CustomMenuCard.tsx';
import { ActiveFilters } from './FilterNotes.tsx';
import { useSwipeKeys } from './SwipeDeck.tsx';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from './SwipeCard.tsx';

const actions: { direction: SwipeDirection; label: string; Icon: typeof Check }[] = [
  { direction: 'left', label: 'Másikat kérek', Icon: RefreshCw },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const keys: Record<string, SwipeDirection> = { ArrowLeft: 'left', ArrowRight: 'right' };

/** A generated menu as one card: swiping right accepts it for the day, swiping left asks for another one. */
export function GeneratedDeck({
  day,
  draft,
  catalog,
  preferences,
  onAccept,
  onReject,
  onChangeCourses,
  onOpenSettings,
}: {
  day: Day;
  draft: CustomDraft;
  catalog: Dish[];
  preferences: Preferences;
  onAccept(): void;
  onReject(): void;
  onChangeCourses(): void;
  onOpenSettings(): void;
}) {
  const card = useRef<SwipeCardHandle>(null);
  const option = customOption(draft, preferences);
  useSwipeKeys(card, option !== null, keys);
  const limit = preferences.limitCalories ? calorieLimit(preferences) : null;

  if (!option) {
    const problem = generationProblem(dayCandidates(catalog, day), draft.courses, preferences);
    return (
      <div className="deck">
        <div className="placeholder-card" role="status">
          <span className="section-icon">
            <Utensils size={25} />
          </span>
          {problem === 'limit' ? (
            <>
              <h2>Nincs a keretbe férő menü</h2>
              <p>
                A kiválasztott fogások legkönnyebb ételei együtt is túllépik a napi keretedet ({calories(limit)}). Válassz
                kevesebb fogást, vagy emeld a keretet a beállításokban.
              </p>
            </>
          ) : (
            <>
              <h2>Nincs választható étel</h2>
              <p>A kiválasztott fogásokból ma nincs rendelhető étel, vagy a szűrőid mindet kizárják.</p>
              <ActiveFilters preferences={preferences} onOpenSettings={onOpenSettings} />
            </>
          )}
          <button type="button" className="button secondary" onClick={onChangeCourses}>
            <ListChecks size={17} /> Fogások módosítása
          </button>
        </div>
      </div>
    );
  }

  // Components without any dish today are left out of the menu.
  const missing = draft.courses.filter(course => !draft.picks[course]);
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
      <div className="deck-actions" aria-label="Generált menü elfogadása vagy cseréje">
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
        <p className="nutrition-note">Ma nincs választható: {missing.map(course => courseNames[course]).join(', ')}.</p>
      )}
    </>
  );
}
