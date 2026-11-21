import { useState } from 'react';
import { ChevronRight, Flame, ListChecks, Sun, Utensils } from 'lucide-react';
import type { PlannerAction } from '../../core/planner.ts';
import { calorieLimit, dayCandidates, days, mealOptions, menuDeck, menuDecks, selectionIssue } from '../../core/planning.ts';
import type { CatalogDish, CustomDraft, Day, Plan, Preferences } from '../../core/types.ts';
import { CustomMenuCard } from '../components/CustomMenuCard.tsx';
import { MealCard } from '../components/MealCard.tsx';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { WeekProgress } from '../components/WeekProgress.tsx';
import { calories } from '../format.ts';
import { CustomDay } from './CustomDay.tsx';

const menuNouns = { checked: 'menü', missing: 'menühöz', again: 'Menük újranézése' };

/** Step 2: one day at a time, first the menu type, then its swipe deck or the custom-day flow. A finished day shows its decision. */
export function MealsScreen({
  plan,
  day,
  eligible,
  catalog,
  preferences,
  editing,
  done,
  custom,
  dispatch,
}: {
  plan: Plan;
  day: Day;
  eligible: Day[];
  catalog: CatalogDish[];
  preferences: Preferences;
  editing: boolean;
  done: boolean;
  /** The day as a custom day in progress, if it is one. */
  custom: CustomDraft | null;
  dispatch(action: PlannerAction): void;
}) {
  const [deck, setDeck] = useState<(typeof menuDecks)[number] | null>(null);
  const picked = plan.slots[day];
  const budget = preferences.limitCalories ? calorieLimit(preferences) : null;
  const issue = done && picked && selectionIssue(picked, day, eligible, catalog, preferences);
  const toMenuTypes = () => (custom ? dispatch({ type: 'leaveCustom', day }) : setDeck(null));
  const open = (stage: CustomDraft['stage']) => dispatch({ type: 'openStage', day, stage });
  // The breadcrumb: the menu type, then either the set-menu deck or the custom-day steps.
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: 'Menütípus', onClick: toMenuTypes }];
  if (custom) {
    crumbs.push({ label: 'Összetevők', onClick: () => open('select') });
    if (custom.stage !== 'select') crumbs.push({ label: 'Saját menü', onClick: () => open('overview') });
  } else if (deck) {
    crumbs.push({ label: deck.label });
  }

  return (
    <main className="picker" aria-label={`Napi válogatás · ${days[day - 1]}`}>
      <WeekProgress plan={{ ...plan, day }} eligible={eligible} onSelect={value => dispatch({ type: 'openDay', day: value })} />
      {!done && (
        <nav className="day-steps" aria-label="A napi válogatás lépései">
          <ol>
            {crumbs.map(({ label, onClick }, index) => {
              const current = index === crumbs.length - 1;
              return (
                <li key={label} aria-current={current ? 'step' : undefined}>
                  {index > 0 && <ChevronRight size={15} aria-hidden="true" />}
                  {current || !onClick ? (
                    <span>{label}</span>
                  ) : (
                    <button type="button" onClick={onClick}>
                      {label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {(day > 5 || (budget !== null && !custom)) && (
        <div className="picker-details">
          {day > 5 && <span>Pénteki kiszállítás</span>}
          {budget !== null && !custom && (
            <span className="day-budget">
              <Flame size={18} aria-hidden="true" /> Max. {calories(budget)}
            </span>
          )}
        </div>
      )}
      {editing && picked && !custom && (
        <p className="editing-note">Jelenlegi választás · {picked.dishes.map(dish => dish.menuName || dish.name).join(' + ')}</p>
      )}
      {done ? (
        <>
          <div className="deck">
            {picked?.kind === 'custom' ? (
              <CustomMenuCard option={picked} target={budget} />
            ) : picked ? (
              <MealCard option={picked} target={budget} />
            ) : (
              <div className="placeholder-card">
                <h2>Kihagytad ezt a napot</h2>
              </div>
            )}
          </div>
          {issue && <p className="selection-issue completed-day-issue">{issue}</p>}
        </>
      ) : custom ? (
        <CustomDay plan={plan} day={day} draft={custom} catalog={catalog} preferences={preferences} dispatch={dispatch} />
      ) : deck ? (
        <SwipeDeck
          plan={plan}
          day={day}
          deckKey={deck.id}
          candidates={dayCandidates(catalog, day).filter(dish => menuDeck(dish) === deck.id)}
          buildOptions={dishes => mealOptions(dishes, preferences, deck.id)}
          target={budget}
          nouns={menuNouns}
          empty={() => (
            <>
              <span className="section-icon">
                <Utensils size={25} />
              </span>
              <h2>Nincs választható menü</h2>
              <p>Válts menütípust, vagy ellenőrizd a szűrőket a beállításokban.</p>
            </>
          )}
          onAction={(action, option) => dispatch({ type: 'decide', day, action, option })}
        />
      ) : (
        <div className="menu-type-picker">
          <div className="menu-type-options" role="group" aria-label="Válassz menütípust">
            {menuDecks.map(type => {
              const Icon = type.id === 'lunch' ? Utensils : Sun;
              return (
                <button key={type.id} type="button" className="button secondary" onClick={() => setDeck(type)}>
                  <Icon size={24} aria-hidden="true" />
                  <span>{type.label}</span>
                </button>
              );
            })}
            <button type="button" className="button secondary" onClick={() => dispatch({ type: 'startCustom', day })}>
              <ListChecks size={24} aria-hidden="true" />
              <span>Saját menük</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
