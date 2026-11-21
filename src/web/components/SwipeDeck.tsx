import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Check, RotateCcw, Soup, Utensils, X } from 'lucide-react';
import { dayQueue, type DeckAction } from '../../core/planning.ts';
import type { CatalogDish, Day, Dish, MenuOption, Plan } from '../../core/types.ts';
import { number } from '../format.ts';
import { loadDayDishes, type DayDishes } from '../menu-client.ts';
import { MealCard } from './MealCard.tsx';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard.tsx';

type CardDecision = 'left' | 'up' | 'right';
const actions: { direction: CardDecision; label: string; Icon: typeof X }[] = [
  { direction: 'left', label: 'Passz', Icon: X },
  { direction: 'up', label: 'Talán', Icon: Bookmark },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const keyDecisions: Record<string, CardDecision> = { ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right' };

type DeckState =
  { phase: 'loading'; progress: [number, number] } | ({ phase: 'ready' } & DayDishes) | { phase: 'error'; message: string };
const startedLoading: DeckState = { phase: 'loading', progress: [0, 0] };

/** How a deck names its items: set menus or single dishes. */
export interface DeckNouns {
  /** "… menü ellenőrizve" */
  checked: string;
  /** "… menühöz nem érhető el kalóriaadat" */
  missing: string;
  /** The button that brings back passed cards. */
  again: string;
}

/**
 * A swipe deck for the plan's day. It loads course details for `candidates`, turns them into cards with `buildOptions`,
 * and hides cards the user already passed or put back, using the day's swipe history.
 */
export function SwipeDeck({
  plan,
  day,
  deckKey,
  candidates,
  buildOptions,
  target,
  nouns,
  empty,
  onAction,
}: {
  plan: Plan;
  day: Day;
  /** Identifies the deck's candidates; a change loads them again. */
  deckKey: string;
  candidates: CatalogDish[];
  buildOptions(dishes: Dish[]): MenuOption[];
  /** Calories a card may have before it shows as over the target, or null. */
  target: number | null;
  nouns: DeckNouns;
  /** Shown when no card can be offered at all, given the loaded dishes. */
  empty(dishes: Dish[]): ReactNode;
  onAction(action: DeckAction, option: MenuOption | undefined): void;
}) {
  const card = useRef<SwipeCardHandle>(null);
  const [attempt, setAttempt] = useState(0);
  const [animation, setAnimation] = useState(0);
  const { week } = plan;
  // Each update remembers the request it belongs to, so an outdated one reads as loading.
  const request = `${week}:${day}:${deckKey}:${attempt}`;
  const [loaded, setLoaded] = useState<{ request: string; state: DeckState } | null>(null);
  const state = loaded?.request === request ? loaded.state : startedLoading;

  useEffect(() => {
    const aborter = new AbortController();
    const { signal } = aborter;
    const update = (next: DeckState) => {
      if (!signal.aborted) setLoaded({ request, state: next });
    };
    loadDayDishes(week, day, candidates, signal, (current, total) => {
      update({ phase: 'loading', progress: [current, total] });
    })
      .then(result => update({ phase: 'ready', ...result }))
      .catch((error: Error) => update({ phase: 'error', message: error.message }));
    return () => aborter.abort();
    // The request identifies the candidates, so their identity does not restart loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, week, day]);

  const options = state.phase === 'ready' ? buildOptions(state.dishes) : [];
  const queue = dayQueue(options, { ...plan, day });
  const top = queue[0];
  const retry = () => setAttempt(value => value + 1);
  const act = (action: DeckAction) => {
    setAnimation(value => value + 1);
    onAction(action, top);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const decision = keyDecisions[event.key];
      const target = event.target as HTMLElement;
      if (
        !decision ||
        !top ||
        event.repeat ||
        document.querySelector('dialog[open]') ||
        !['BODY', 'DIV'].includes(target.tagName)
      )
        return;
      event.preventDefault();
      card.current?.swipe(decision);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top]);

  return (
    <>
      <div className="deck">
        {state.phase === 'loading' ? (
          <div className="placeholder-card" role="status">
            <span className="spinner" aria-hidden="true" />
            <h2>Étlap betöltése…</h2>
            {state.progress[1] > 0 && (
              <p>
                {state.progress[0]}/{state.progress[1]} {nouns.checked} ellenőrizve
              </p>
            )}
          </div>
        ) : state.phase === 'error' ? (
          <div className="placeholder-card" role="status">
            <span className="section-icon">
              <Soup size={25} />
            </span>
            <h2>Az étlap nem érhető el</h2>
            <p>{state.message}</p>
            <button type="button" className="button secondary" onClick={retry}>
              Étlap újratöltése
            </button>
          </div>
        ) : !top && options.length ? (
          <div className="placeholder-card" role="status">
            <span className="section-icon">
              <Utensils size={25} />
            </span>
            <h2>Elfogytak a lehetőségek</h2>
            <button type="button" className="button secondary" onClick={() => act('restart')}>
              <RotateCcw size={17} /> {nouns.again}
            </button>
          </div>
        ) : !top ? (
          <div className="placeholder-card" role="status">
            {empty(state.phase === 'ready' ? state.dishes : [])}
          </div>
        ) : (
          <>
            {queue.length > 1 && <div className="card-backing" aria-hidden="true" />}
            <SwipeCard
              key={top.id + ':' + animation}
              ref={card}
              actions={actions}
              onAction={direction => {
                if (direction !== 'down') act(direction);
              }}
            >
              <MealCard option={top} target={target} />
            </SwipeCard>
          </>
        )}
      </div>
      {top && (
        <div className="deck-actions" aria-label="Étel kiválasztása vagy kihagyása">
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
      )}
      {top && (
        <div className="day-links" aria-live="polite">
          {number.format(queue.length)} lehetőség maradt
        </div>
      )}
      {state.phase === 'ready' && state.unavailable > 0 && (
        <p className="nutrition-note">
          {number.format(state.unavailable)} {nouns.missing} nem érhető el kalóriaadat.
          {state.failures > 0 && (
            <button type="button" className="text-button" onClick={retry}>
              Adatok újratöltése
            </button>
          )}
        </p>
      )}
    </>
  );
}
