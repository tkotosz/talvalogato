import { useState } from 'react';
import { ChevronRight, Flame, ListChecks, Sparkles, Sun, Truck, Utensils } from 'lucide-react';
import type { PlannerAction } from '../../core/planner.ts';
import { calorieLimit, dayCandidates, days, mealOptions, menuDeck, menuDecks, selectionIssue } from '../../core/planning.ts';
import type { Dish, CustomDraft, Day, Plan, Preferences } from '../../core/types.ts';
import { CustomMenuCard } from '../components/CustomMenuCard.tsx';
import { MealCard } from '../components/MealCard.tsx';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { WeekProgress } from '../components/WeekProgress.tsx';
import { calories, daysOn } from '../format.ts';
import { CustomDay } from './CustomDay.tsx';

const menuNouns = { missing: 'menühöz', again: 'Menük újranézése' };

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
  catalog: Dish[];
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
  const choosing = !done && !custom && !deck;
  // Teletál delivers weekend meals with Friday's delivery.
  const weekendNote = day > 5 && (
    <p className="info-note" role="note">
      <Truck size={18} aria-hidden="true" />
      <span>A {day === 6 ? 'szombati' : 'vasárnapi'} ételek pénteken érkeznek, mert a Teletál hétvégén nem szállít.</span>
    </p>
  );
  const toMenuTypes = () => (custom ? dispatch({ type: 'leaveCustom', day }) : setDeck(null));
  const open = (stage: CustomDraft['stage']) => dispatch({ type: 'openStage', day, stage });
  // The breadcrumb: the menu type, then either the set-menu deck or the custom-day steps.
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: 'Mit eszel?', onClick: toMenuTypes }];
  if (custom) {
    crumbs.push({ label: 'Összetevők', onClick: () => open('select') });
    if (custom.stage !== 'select') {
      crumbs.push(
        custom.generator
          ? { label: 'Generált menü', onClick: () => open('generated') }
          : { label: 'Saját menü', onClick: () => open('overview') },
      );
    }
  } else if (deck) {
    crumbs.push({ label: deck.label });
  }

  return (
    <main className="picker" aria-label={`Napi válogatás · ${days[day - 1]}`}>
      <WeekProgress plan={{ ...plan, day }} eligible={eligible} onSelect={value => dispatch({ type: 'openDay', day: value })} />
      {!done && crumbs.length > 1 && (
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
      {!choosing && weekendNote}
      {budget !== null && (!custom || custom.generator) && (
        <div className="picker-details">
          <span className="day-budget">
            <Flame size={18} aria-hidden="true" /> Max. {calories(budget)}
          </span>
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
        <section className="menu-choices" aria-labelledby="menu-choices-title">
          <h2 id="menu-choices-title">Mit eszel {daysOn[day - 1]}?</h2>
          {weekendNote}
          <ul>
            {[
              {
                Icon: Utensils,
                title: 'Teletál ebédmenü választása',
                hint: 'Leves és főétel egy menüben',
                onClick: () => setDeck(menuDecks[0]!),
              },
              {
                Icon: Sun,
                title: 'Teletál egész napos menü választása',
                hint: 'Több étkezés egy csomagban, reggeltől estig',
                onClick: () => setDeck(menuDecks[1]!),
              },
              {
                Icon: ListChecks,
                title: 'Saját menü összeállítása',
                hint: 'Válogass fogásonként: leves, főétel, kiegészítők',
                onClick: () => dispatch({ type: 'startCustom', day }),
              },
              {
                Icon: Sparkles,
                title: 'Menü generálása',
                hint: 'Megadod, miből álljon, mi összerakjuk. Kérhetsz másikat is.',
                // The seed makes each generated day different; the reducer itself stays free of randomness.
                onClick: () => dispatch({ type: 'startGenerated', day, seed: Math.floor(Math.random() * 2 ** 32) }),
              },
            ].map(({ Icon, title, hint, onClick }) => (
              <li key={title}>
                <button type="button" className="menu-choice" onClick={onClick}>
                  <span className="menu-choice-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="menu-choice-text">
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
