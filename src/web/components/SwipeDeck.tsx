import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Bookmark, Check, RotateCcw, Utensils, X } from 'lucide-react';
import { dayQueue, type DeckAction } from '../../core/planning.ts';
import type { Day, Dish, MenuOption, Plan, WeekKey } from '../../core/types.ts';
import { number } from '../format.ts';
import { MealCard } from './MealCard.tsx';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from './SwipeCard.tsx';

type CardDecision = 'left' | 'up' | 'right';
const actions: { direction: CardDecision; label: string; Icon: typeof X }[] = [
  { direction: 'left', label: 'Passz', Icon: X },
  { direction: 'up', label: 'Talán', Icon: Bookmark },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const keyDecisions: Record<string, CardDecision> = { ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right' };

/** Swipes the card with the arrow keys while `active`, unless a dialog is open or a control has the focus. */
export function useSwipeKeys(
  card: RefObject<SwipeCardHandle | null>,
  active: boolean,
  keys: Record<string, SwipeDirection>,
): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = keys[event.key];
      const target = event.target as HTMLElement;
      if (
        !direction ||
        !active ||
        event.repeat ||
        document.querySelector('dialog[open]') ||
        !['BODY', 'DIV'].includes(target.tagName)
      )
        return;
      event.preventDefault();
      card.current?.swipe(direction);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, active, keys]);
}

/** How a deck names its items: set menus or single dishes. */
export interface DeckNouns {
  /** "… menühöz nem érhető el kalóriaadat" */
  missing: string;
  /** The button that brings back passed cards. */
  again: string;
}

/**
 * A swipe deck for the plan's day. It turns `candidates` into cards with `buildOptions` and hides cards the user
 * already passed or put back, using the day's swipe history.
 */
export function SwipeDeck({
  plan,
  day,
  candidates,
  buildOptions,
  target,
  priceTarget,
  teletalWeek,
  nouns,
  empty,
  onAction,
}: {
  plan: Plan;
  day: Day;
  candidates: Dish[];
  buildOptions(dishes: Dish[]): MenuOption[];
  /** Calories a card may have before it shows as over the target, or null. */
  target: number | null;
  /** Forints a card may cost before it shows as over what the spending limit leaves, or null. */
  priceTarget: number | null;
  /** The week whose Teletál menu the cards link to, or null for no links. */
  teletalWeek: WeekKey | null;
  nouns: DeckNouns;
  /** Shown when no card can be offered at all, given the candidates. */
  empty(dishes: Dish[]): ReactNode;
  onAction(action: DeckAction, option: MenuOption | undefined): void;
}) {
  const card = useRef<SwipeCardHandle>(null);
  const [animation, setAnimation] = useState(0);
  const options = buildOptions(candidates);
  const unavailable = candidates.filter(dish => dish.kcal === null).length;
  const queue = dayQueue(options, { ...plan, day });
  const top = queue[0];
  const act = (action: DeckAction) => {
    setAnimation(value => value + 1);
    onAction(action, top);
  };

  useSwipeKeys(card, top !== undefined, keyDecisions);

  return (
    <>
      <div className="deck">
        {!top && options.length ? (
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
            {empty(candidates)}
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
              <MealCard option={top} target={target} priceTarget={priceTarget} teletalWeek={teletalWeek} />
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
      {unavailable > 0 && (
        <p className="nutrition-note">
          {number.format(unavailable)} {nouns.missing} nem érhető el kalóriaadat.
        </p>
      )}
    </>
  );
}
