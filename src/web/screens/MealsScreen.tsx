import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ChevronRight, Flame, RotateCcw, Soup, Sun, Utensils, X } from 'lucide-react';
import type { PlannerAction } from '../../core/planner.ts';
import {
  calorieLimit, dayCandidates, dayQueue, days, mealOptions, menuDeck, menuDecks, selectionIssue, type DeckAction,
} from '../../core/planning.ts';
import type { CatalogDish, Day, MenuDeckId, MenuOption, Plan, Preferences } from '../../core/types.ts';
import { MealCard } from '../components/MealCard.tsx';
import { SwipeCard, type SwipeCardHandle } from '../components/SwipeCard.tsx';
import { WeekProgress } from '../components/WeekProgress.tsx';
import { calories, number } from '../format.ts';
import { loadDayDishes, type DayDishes } from '../menu-client.ts';

type CardDecision = 'left' | 'up' | 'right';
const actions: { direction: CardDecision; label: string; Icon: typeof X }[] = [
  { direction: 'left', label: 'Passz', Icon: X },
  { direction: 'up', label: 'Talán', Icon: Bookmark },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const keyDecisions: Record<string, CardDecision> = { ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right' };

type DeckState =
  | { phase: 'loading'; progress: [number, number] }
  | ({ phase: 'ready' } & DayDishes)
  | { phase: 'error'; message: string };

/** The swipe deck of one menu type for the plan's current day. */
function DayDeck({ plan, day, catalog, deck, preferences, budget, onAction }: {
  plan: Plan;
  day: Day;
  catalog: CatalogDish[];
  deck: MenuDeckId;
  preferences: Preferences;
  budget: number | null;
  onAction(action: DeckAction, option: MenuOption | undefined): void;
}) {
  const card = useRef<SwipeCardHandle>(null);
  const [attempt, setAttempt] = useState(0);
  const [animation, setAnimation] = useState(0);
  const [state, setState] = useState<DeckState>({ phase: 'loading', progress: [0, 0] });
  const { week } = plan;

  useEffect(() => {
    const aborter = new AbortController();
    const { signal } = aborter;
    const candidates = new Map(dayCandidates(catalog, day).filter(dish => menuDeck(dish) === deck)
      .map(dish => [dish.id, dish]));
    setState({ phase: 'loading', progress: [0, 0] });
    loadDayDishes(week, day, [...candidates.values()], signal, (current, total) => {
      if (!signal.aborted) setState({ phase: 'loading', progress: [current, total] });
    }).then(result => {
      if (!signal.aborted) setState({ phase: 'ready', ...result });
    }).catch((error: Error) => {
      if (!signal.aborted) setState({ phase: 'error', message: error.message });
    });
    return () => aborter.abort();
  }, [week, day, catalog, attempt, deck]);

  const options = useMemo(() => state.phase === 'ready' ? mealOptions(state.dishes, preferences, deck) : [],
    [state, preferences, deck]);
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
      if (!decision || !top || event.repeat || document.querySelector('dialog[open]')
        || !['BODY', 'DIV'].includes(target.tagName)) return;
      event.preventDefault();
      card.current?.swipe(decision);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top]);

  return <>
    <div className="deck">
      {state.phase === 'loading' ? <div className="placeholder-card" role="status">
        <span className="spinner" aria-hidden="true" />
        <h2>Étlap betöltése…</h2>
        {state.progress[1] > 0 && <p>{state.progress[0]}/{state.progress[1]} menü ellenőrizve</p>}
      </div> : state.phase === 'error' ? <div className="placeholder-card" role="status">
        <span className="section-icon"><Soup size={25} /></span>
        <h2>Az étlap nem érhető el</h2><p>{state.message}</p>
        <button type="button" className="button secondary" onClick={retry}>Étlap újratöltése</button>
      </div> : !top ? <div className="placeholder-card" role="status">
        <span className="section-icon"><Utensils size={25} /></span>
        <h2>{options.length ? 'Elfogytak a lehetőségek' : 'Nincs választható menü'}</h2>
        {options.length
          ? <button type="button" className="button secondary" onClick={() => act('restart')}>
            <RotateCcw size={17} /> Menük újranézése
          </button>
          : <p>Válts menütípust, vagy ellenőrizd a szűrőket a beállításokban.</p>}
      </div> : <>
        {queue.length > 1 && <div className="card-backing" aria-hidden="true" />}
        <SwipeCard key={top.id + ':' + animation} ref={card} actions={actions}
          onAction={direction => { if (direction !== 'down') act(direction); }}>
          <MealCard option={top} target={budget} />
        </SwipeCard>
      </>}
    </div>
    {top && <div className="deck-actions" aria-label="Étel kiválasztása vagy kihagyása">
      {actions.map(({ direction, label, Icon }) => <button type="button" key={direction} className={'decision decision-' + direction}
        onClick={() => card.current?.swipe(direction)}>
        <span className="decision-icon"><Icon size={23} strokeWidth={2.2} /></span><span>{label}</span>
      </button>)}
    </div>}
    {top && <div className="day-links" aria-live="polite">{number.format(queue.length)} lehetőség maradt</div>}
    {state.phase === 'ready' && state.unavailable > 0 && <p className="nutrition-note">
      {number.format(state.unavailable)} menühöz nem érhető el kalóriaadat.
      {state.failures > 0 && <button type="button" className="text-button" onClick={retry}>Adatok újratöltése</button>}
    </p>}
  </>;
}

/** Step 2: one day at a time, first the menu type, then its swipe deck. A finished day shows its decision. */
export function MealsScreen({ plan, day, eligible, catalog, preferences, editing, done, dispatch }: {
  plan: Plan;
  day: Day;
  eligible: Day[];
  catalog: CatalogDish[];
  preferences: Preferences;
  editing: boolean;
  done: boolean;
  dispatch(action: PlannerAction): void;
}) {
  const [deck, setDeck] = useState<(typeof menuDecks)[number] | null>(null);
  const picked = plan.slots[day];
  const budget = preferences.limitCalories ? calorieLimit(preferences) : null;
  const issue = done && picked && selectionIssue(picked, day, eligible, catalog, preferences);

  return <main className="picker" aria-label={`Napi válogatás · ${days[day - 1]}`}>
    <WeekProgress plan={{ ...plan, day }} eligible={eligible} onSelect={value => dispatch({ type: 'openDay', day: value })} />
    {!done && <nav className="day-steps" aria-label="A napi válogatás lépései">
      <ol>
        <li aria-current={!deck ? 'step' : undefined}>
          {deck ? <button type="button" onClick={() => setDeck(null)}>Menütípus</button> : <span>Menütípus</span>}
        </li>
        <li aria-current={deck ? 'step' : undefined}>
          <ChevronRight size={15} aria-hidden="true" /><span>Menük</span>
        </li>
      </ol>
      {deck && <p>{deck.label}</p>}
    </nav>}
    {(day > 5 || budget !== null) && <div className="picker-details">
      {day > 5 && <span>Pénteki kiszállítás</span>}
      {budget !== null && <span className="day-budget"><Flame size={18} aria-hidden="true" /> Max. {calories(budget)}</span>}
    </div>}
    {editing && picked && <p className="editing-note">Jelenlegi választás · {picked.dishes.map(dish => dish.menuName || dish.name).join(' + ')}</p>}
    {done ? <>
      <div className="deck">
        {picked ? <MealCard option={picked} target={budget} />
          : <div className="placeholder-card"><h2>Kihagytad ezt a napot</h2></div>}
      </div>
      {issue && <p className="selection-issue completed-day-issue">{issue}</p>}
    </> : deck ? <DayDeck plan={plan} day={day} catalog={catalog} deck={deck.id} preferences={preferences} budget={budget}
      onAction={(action, option) => dispatch({ type: 'decide', day, action, option })} />
      : <div className="menu-type-picker">
        <div className="menu-type-options" role="group" aria-label="Válassz menütípust">
          {menuDecks.map(type => {
            const Icon = type.id === 'lunch' ? Utensils : Sun;
            return <button key={type.id} type="button" className="button secondary" onClick={() => setDeck(type)}>
              <Icon size={24} aria-hidden="true" /><span>{type.label}</span>
            </button>;
          })}
        </div>
      </div>}
  </main>;
}
