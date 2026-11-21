import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bookmark, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Copy, Download, Flame,
  RotateCcw, ShoppingBasket, SlidersHorizontal, Smartphone, Soup, Sun, Utensils, X,
} from 'lucide-react';
import { CodeFilter } from './CodeFilter.tsx';
import { SwipeCard } from './SwipeCard.tsx';
import { shortcutUrl, teletalWeekUrl } from './cart-shortcut.ts';
import { loadDayDishes, loadJson, loadMenuCatalog } from './menu-client.ts';
import {
  allDays, calorieLimit, choose, dayCandidates, dayQueue, days, mealOptions, menuDeck, menuDecks, orderSummary,
  normalizeGroupTitle, restorePlan, restorePreferences, selectionIssue, startPlan, validCalorieBudget,
} from '../core/planning.ts';
import { defaultWeek, eligibleDays, mondayOfWeek, upcomingWeeks, weekLabel } from '../core/weeks.ts';
import './styles.css';

const storageKey = 'talvalogato.plan.v2';
const preferencesKey = 'talvalogato.preferences.v1';
const appName = 'Tálválogató';
const cartUrl = 'https://www.teletal.hu/kosar';
const actions = [
  { direction: 'left', label: 'Passz', Icon: X },
  { direction: 'up', label: 'Talán', Icon: Bookmark },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const shortDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
const menuCoverage = new Map([
  ['Z10', '5 étkezés'],
  ['Z11', '4 étkezés a 8 órás étkezési időszakra'],
  ['IR', 'Ebéd és vacsora'],
  ['IRN', '6 étkezés, ebédtől másnap tízóraiig'],
]);
const coursePlaceholders = {
  soup: '/meal-placeholder-soup.webp',
  main: '/meal-placeholder-main.webp',
  third: '/meal-placeholder-third.webp',
};
const number = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
const money = value => `${number.format(value)}\u00a0Ft`;
const calories = value => Number.isFinite(value) ? `${number.format(value)}\u00a0kcal` : 'Nincs kalóriaadat';

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function savedPlanner() {
  const saved = readStorage(storageKey) ?? readStorage('talvalogato.plan.v1') ?? readStorage('meal-deck.plan.v1');
  const plan = saved?.id && mondayOfWeek(saved.week ?? saved.settings?.week) ? restorePlan(saved) : null;
  return { plan, preferences: restorePreferences(readStorage(preferencesKey), saved?.settings) };
}

function Modal({ name, onClose, children, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current.showModal();
    return () => opener?.focus({ preventScroll: true });
  }, []);
  return <dialog ref={ref} className={className} aria-labelledby="dialog-title" onCancel={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-content">
      <button type="button" className="icon-button close-modal" onClick={onClose} aria-label="Bezárás"><X size={20} /></button>
      <h2 id="dialog-title">{name}</h2>
      {children}
    </div>
  </dialog>;
}

function InstallButton({ onHelp }) {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  useEffect(() => {
    const remember = event => { event.preventDefault(); setPrompt(event); };
    const onInstall = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', remember);
    window.addEventListener('appinstalled', onInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', remember);
      window.removeEventListener('appinstalled', onInstall);
    };
  }, []);
  if (installed) return null;
  return <button type="button" className="quiet-button" aria-label="Telepítés" onClick={async () => {
    if (!prompt) return onHelp();
    setPrompt(null);
    await prompt.prompt();
  }}><Download size={17} /> <span>Telepítés</span></button>;
}

function StepProgress({ step, onNavigate }) {
  return <nav className="step-progress" aria-label="Tervezési lépések">
    <ol>
      {[['week', 'Hét'], ['meals', 'Ételek'], ['overview', 'Áttekintés']].map(([id, label], index) =>
        <li key={id}>
          <button className="step-link" type="button" aria-current={step === id ? 'step' : undefined} onClick={() => onNavigate(id)}>
            <span className="step-number" aria-hidden="true">{index + 1}</span>{label}
          </button>
        </li>)}
    </ol>
  </nav>;
}

function StepBar({ step, disabled, onBack, dayAction, onNext }) {
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

function DayChoices({ label, selected, available = allDays, onChange }) {
  return <fieldset className="day-choices">
    <legend>{label}</legend>
    <div className="day-choices-grid">
      {allDays.map(day => {
        const disabled = !available.includes(day);
        const pressed = !disabled && selected.includes(day);
        return <button key={day} type="button" aria-label={disabled ? `${days[day - 1]}, nem rendelhető` : days[day - 1]}
          aria-pressed={pressed} disabled={disabled}
          onClick={() => onChange(allDays.filter(value => value === day ? !pressed : selected.includes(value)))}>
          {shortDays[day - 1]}
        </button>;
      })}
    </div>
  </fieldset>;
}

function WeekSelection({ week, weeks, recommended, weekError, catalog, availableDays, selectedDays, eligible, savedWeek,
  onSelect, onDaysChange, onReset, onRetryWeeks, onRetryCatalog, onContinue }) {
  return <main className="setup">
    <div className="setup-grid">
      <section className="welcome">
        <div className="welcome-copy">
          <h1>Tervezd meg a heti menüdet!</h1>
          <p>Válassz hetet, majd válogass a Teletál ebédmenüi és egész napos menüi közül.</p>
        </div>
        <div className="deck-art" aria-hidden="true">
          <div className="art-card art-card-left"><Soup size={40} strokeWidth={1.4} /></div>
          <div className="art-card art-card-right"><CalendarDays size={42} strokeWidth={1.4} /></div>
          <div className="art-card art-card-front">
            <span className="art-plate"><Utensils size={44} strokeWidth={1.55} /></span>
            <span className="art-lines"><i /><i /></span>
            <span className="art-check"><Check size={23} strokeWidth={2.5} /></span>
          </div>
        </div>
      </section>
      <form id="week-selection" className="settings-card week-card" onSubmit={event => {
        event.preventDefault();
        if (eligible.length && catalog.phase === 'ready') onContinue();
      }}>
        <div className="settings-heading">
          <span className="section-icon"><CalendarDays size={21} /></span>
          <h2>Hét kiválasztása</h2>
        </div>
        <label htmlFor="week">Kiszállítás hete</label>
        <div className="select-wrap">
          <CalendarDays size={18} aria-hidden="true" />
          <select id="week" value={week} disabled={!weeks.length} onChange={event => onSelect(event.target.value)}>
            {!week && <option value="">{weekError ? 'A hetek nem érhetők el' : 'Hetek betöltése…'}</option>}
            {weeks.map(({ key }) => <option key={key} value={key}>
              {weekLabel(key)}{key === recommended ? ' (ajánlott)' : ''}
            </option>)}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </div>
        {onReset && <button type="button" className="text-button week-plan-link" onClick={onReset}>Heti válogatás újrakezdése</button>}
        {week && <DayChoices label="Rendelési napok" selected={selectedDays} available={availableDays} onChange={onDaysChange} />}
        {weekError && <div className="form-error" role="alert">{weekError}
          <button type="button" className="text-button" onClick={onRetryWeeks}>Újra</button>
        </div>}
        {week && catalog.phase === 'loading' && <p role="status">Rendelhető napok ellenőrzése…</p>}
        {catalog.phase === 'error' && <div className="form-error" role="alert">{catalog.message}
          <button type="button" className="text-button" onClick={onRetryCatalog}>Újra</button>
        </div>}
        {week && catalog.phase === 'ready' && !eligible.length && <p role="status">
          {availableDays.length ? 'Válassz legalább egy rendelhető napot.' : 'Erre a hétre már nem rendelhetsz.'}
        </p>}
        {savedWeek && savedWeek !== week && weeks.some(item => item.key === savedWeek)
          && <button type="button" className="text-button week-plan-link" onClick={() => onSelect(savedWeek)}>
            Mentett hét kiválasztása
          </button>}
      </form>
    </div>
  </main>;
}

function PreferencesForm({ preferences, week, onSave }) {
  const [draft, setDraft] = useState(preferences);
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const validBudget = validCalorieBudget(draft);
  const limit = calorieLimit(draft);
  return <form className="preferences-form" onSubmit={event => {
    event.preventDefault();
    if (!draft.limitCalories || validBudget) onSave(restorePreferences(draft));
  }}>
    <DayChoices label="Alapértelmezett rendelési napok" selected={draft.defaultDays} onChange={value => change('defaultDays', value)} />
    <label className="preference-toggle">
      <input type="checkbox" checked={draft.limitCalories} onChange={event => change('limitCalories', event.target.checked)} />
      Napi kalóriakeret
    </label>
    {draft.limitCalories && <>
      <div className="number-fields">
        <label htmlFor="target">Napi kalóriacél
          <span className="field-wrap">
            <input id="target" type="number" inputMode="numeric" min="1" step="1" required
              value={draft.calories} onChange={event => change('calories', event.target.value === '' ? '' : event.target.valueAsNumber)} />
            <span>kcal</span>
          </span>
        </label>
        <label htmlFor="tolerance">Ráhagyás
          <span className="field-wrap">
            <input id="tolerance" type="number" inputMode="decimal" min="0" max="100" step="any" required
              value={draft.tolerance} onChange={event => change('tolerance', event.target.value === '' ? '' : event.target.valueAsNumber)} />
            <span>%</span>
          </span>
        </label>
      </div>
      {validBudget ? <div className="budget-note"><Flame size={19} aria-hidden="true" />
        <strong>Naponta legfeljebb {calories(limit)}</strong>
      </div> : <p className="form-error" role="status">Adj meg egy pozitív egész kalóriacélt és 0–100% ráhagyást.</p>}
    </>}
    <label className="preference-toggle">
      <input type="checkbox" checked={draft.filterCodes} onChange={event => change('filterCodes', event.target.checked)} />
      Teletál-kódok szűrése
    </label>
    {draft.filterCodes && (week
      ? <CodeFilter week={week} excludedCodes={draft.excludedCodes} onChange={codes => change('excludedCodes', codes)} />
      : <p role="status">A kódlista az elérhető hetek betöltése után jelenik meg.</p>)}
    <div className="modal-actions">
      <button type="submit" className="button primary" disabled={draft.limitCalories && !validBudget}>Mentés</button>
    </div>
  </form>;
}

function WeekProgress({ plan, eligible, onSelect }) {
  return <ol aria-label="A heti válogatás állása" className="week-progress">
    {plan.selectedDays.map(dayNumber => {
      const day = days[dayNumber - 1];
      const available = eligible.includes(dayNumber);
      const active = plan.day === dayNumber;
      const done = available && Object.hasOwn(plan.slots, dayNumber);
      const picked = done && Boolean(plan.slots[dayNumber]);
      return <li key={day}><button type="button" aria-current={active ? 'step' : undefined} disabled={!available}
        aria-label={`${day}${!available ? ', nem rendelhető' : done ? picked ? ', étel kiválasztva' : ', kihagyva' : ''}`}
        className={done ? picked ? 'picked' : 'skipped' : undefined}
        onClick={() => onSelect(dayNumber)}>
        {picked && <Check size={13} aria-hidden="true" />}<span>{shortDays[dayNumber - 1]}</span>
      </button></li>;
    })}
  </ol>;
}

function MealPhotos({ courses, coverPhoto, children }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState([]);
  const count = courses.length;
  const gallery = count > 2;
  const current = Math.min(active, count - 1);
  const visibleCourses = gallery ? [courses[current]] : courses;
  const changePhoto = offset => setActive((current + offset + count) % count);
  const keepCardStill = event => event.stopPropagation();

  return <div role={gallery ? 'group' : undefined} aria-label={gallery ? 'A fogások fotói' : undefined}>
    <div className={`meal-cover${count === 2 ? ' split-cover' : ''}`}>
      {visibleCourses.map((course, index) => {
        const photo = course.photo ?? (count === 1 ? coverPhoto : null);
        const showPhoto = photo && !failed.includes(photo);
        const placeholder = coursePlaceholders[course.kind] ?? coursePlaceholders.third;
        return <img key={gallery ? current : index} className={showPhoto ? undefined : 'course-placeholder'}
          src={showPhoto ? photo : placeholder}
          alt={showPhoto ? '' : `Illusztráció, a fogás fotója nem érhető el: ${course.name}`}
          draggable="false" onError={showPhoto ? () => setFailed(current => [...current, photo]) : undefined} />;
      })}
      {children}
      {gallery && <div className="meal-gallery-controls">
        <button type="button" aria-label="Előző fogás fotója" onPointerDownCapture={keepCardStill} onClick={() => changePhoto(-1)}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="meal-gallery-dots" aria-hidden="true">
          {courses.map((_, index) => <span key={index} className={index === current ? 'active' : undefined} />)}
        </div>
        <button type="button" aria-label="Következő fogás fotója" onPointerDownCapture={keepCardStill} onClick={() => changePhoto(1)}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>}
    </div>
    {gallery && <p className="meal-gallery-caption" role="status">
      <span>{courses[current].name}</span><span>{current + 1}/{count}</span>
    </p>}
  </div>;
}

function MealCard({ option, target, week }) {
  const { kind, title, components, dishes, kcal, price } = option;
  const customCombo = dishes.length > 1;
  const merchantMenu = kind.startsWith('menu');
  const hasCourses = kind !== 'single' && components?.length > 0;
  const codes = kind === 'single' ? [] : dishes.map(dish => dish.code);
  const hasCodes = codes.length > 0 && codes.every(Boolean);
  const [refreshedCourses, setRefreshedCourses] = useState(null);
  const [labeledDishes, setLabeledDishes] = useState(null);
  const [dish] = dishes;
  const refreshPhotos = merchantMenu && components?.length > 0 && !components.some(course => Object.hasOwn(course, 'photo'));
  const refreshLabels = dishes.some(item => !Object.hasOwn(item, 'groupId'));

  useEffect(() => {
    if (!refreshPhotos) return;
    const aborter = new AbortController();
    const { signal } = aborter;
    // Saved menus from earlier versions have only the first photo.
    loadDayDishes(week, dish.day, [dish], signal, () => {}).then(({ dishes: [refreshed] }) => {
      if (!signal.aborted && refreshed?.components?.length) setRefreshedCourses(refreshed.components);
    }).catch(() => {});
    return () => aborter.abort();
  }, [week, dish, refreshPhotos]);

  useEffect(() => {
    if (!refreshLabels) return;
    const aborter = new AbortController();
    const { signal } = aborter;
    // Use the current catalog labels for choices saved before they were available.
    loadMenuCatalog(week, signal).then(catalog => {
      if (!signal.aborted) setLabeledDishes(dishes.map(item => catalog.find(entry => entry.id === item.id) ?? item));
    }).catch(() => {});
    return () => aborter.abort();
  }, [week, dishes, refreshLabels]);

  const menuDishes = labeledDishes ?? dishes;
  const { menuName, category, section } = menuDishes[0];
  const showGroup = category && category !== menuName && menuDishes.every(item => item.category === category);
  const fallbackHeading = hasCodes ? `Menü ${codes.join(' + ')}` : hasCourses ? 'Menü' : title;
  const showMenuName = !customCombo && menuName && dish.code;
  const heading = showMenuName ? (menuName === dish.code ? dish.code : `${dish.code} ${menuName}`) : fallbackHeading;
  const courses = refreshedCourses ?? components;
  const coverage = merchantMenu ? menuCoverage.get(dish.code) : null;
  const coverCourses = !customCombo && hasCourses ? courses : dishes;
  return <article className="meal-card">
    <MealPhotos courses={coverCourses} coverPhoto={option.photo}>
      {(!merchantMenu || showGroup) && <div className="meal-tags">
        {!merchantMenu && <span className={`meal-tag${customCombo ? ' tag-generated' : ''}`}>
          {customCombo ? <Soup size={16} /> : <Utensils size={15} />} {customCombo ? 'Generált menü' : 'Önálló étel'}
        </span>}
        {showGroup && <span className="meal-tag tag-group">{normalizeGroupTitle(category, section)}</span>}
      </div>}
    </MealPhotos>
    <div className="meal-content">
      <h2 lang="hu">{showMenuName ? <>
        <span className="meal-code">{dish.code}</span>{menuName !== dish.code ? ` ${menuName}` : null}
      </> : heading}</h2>
      {coverage && <p className="meal-dish">{coverage}</p>}
      {showMenuName && !hasCourses && title !== heading && <p className="meal-dish" lang="hu">{title}</p>}
      {hasCourses && <ul className="course-list" aria-label="A menü fogásai">
        {components.map((part, index) => <li key={index}>
          <span lang="hu">{part.name}</span><span>{calories(part.kcal)}</span>
        </li>)}
      </ul>}
      <div className="meal-meta">
        <span className={`calorie-badge${target !== null && kcal > target ? ' over-target' : ''}`}><Flame size={17} />{calories(kcal)}</span>
        <span>{money(price)}</span>
      </div>
    </div>
  </article>;
}

function DayDeck({ plan, catalog, deck, preferences, budget, onAction }) {
  const card = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [animation, setAnimation] = useState(0);
  const [state, setState] = useState({ phase: 'loading', progress: [0, 0] });
  const { week, day } = plan;

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
    }).catch(error => {
      if (!signal.aborted) setState({ phase: 'error', message: error.message });
    });
    return () => aborter.abort();
  }, [week, day, catalog, attempt, deck]);

  const options = useMemo(() => state.phase === 'ready' ? mealOptions(state.dishes, preferences, deck) : [],
    [state, preferences, deck]);
  const queue = dayQueue(options, plan);
  const top = queue[0];
  const retry = () => setAttempt(value => value + 1);
  const act = direction => {
    setAnimation(value => value + 1);
    onAction(day, direction, top);
  };

  useEffect(() => {
    const keys = { ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right' };
    const onKey = event => {
      if (!keys[event.key] || !top || event.repeat || document.querySelector('dialog[open]')
        || !['BODY', 'DIV'].includes(event.target.tagName)) return;
      event.preventDefault();
      card.current?.swipe(keys[event.key]);
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
        <SwipeCard key={top.id + ':' + animation} ref={card} actions={actions} onAction={act}>
          <MealCard option={top} target={budget} week={week} />
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

function Picker({ plan, eligible, catalog, preferences, editing, done, onDay, onAction }) {
  const [deck, setDeck] = useState(null);
  const { week, day } = plan;
  const picked = plan.slots[day];
  const budget = preferences.limitCalories ? calorieLimit(preferences) : null;
  const issue = done && picked && selectionIssue(picked, day, eligible, catalog, preferences);

  return <main className="picker" aria-label={`Napi válogatás · ${days[day - 1]}`}>
    <WeekProgress plan={plan} eligible={eligible} onSelect={onDay} />
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
        {picked ? <MealCard option={picked} target={budget} week={week} />
          : <div className="placeholder-card"><h2>Kihagytad ezt a napot</h2></div>}
      </div>
      {issue && <p className="selection-issue completed-day-issue">{issue}</p>}
    </> : deck ? <DayDeck plan={plan} catalog={catalog} deck={deck.id} preferences={preferences} budget={budget} onAction={onAction} />
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

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CartInstructions({ plan, lines }) {
  const url = teletalWeekUrl(plan, lines);
  const shortcut = shortcutUrl();
  const [copyStatus, setCopyStatus] = useState('');
  return <>
    <p>A kiválasztott ételeket egy könyvjelző segítségével teheted a Teletál-kosárba. Elég egyszer elmentened, utána minden héten használhatod.</p>
    <ol className="instructions">
      <li>
        <strong>Mentsd el a kosárkönyvjelzőt</strong>
        <p>Hozz létre egy <b>Teletál-kosár</b> nevű könyvjelzőt, és cseréld le a címét a kimásolt parancsikonra. Számítógépen a hivatkozást a könyvjelzősávra is húzhatod.</p>
        {(lines.length > 14 || lines.some(line => line.day > 5)) && <p>Ha korábban mentetted el a könyvjelzőt, egyszer frissítsd, hogy a hétvégi menüket és a 14-nél több különböző tételt is a kosárba tehesse.</p>}
        <a ref={link => link?.setAttribute('href', shortcut)} className="drag-bookmark" onClick={event => {
          event.preventDefault();
          copyText(shortcut).then(ok => setCopyStatus(ok ? 'Parancsikon másolva' : 'Húzd a hivatkozást a könyvjelzősávra.'));
        }}><Bookmark size={16} /> Kosárparancsikon másolása vagy húzása</a>
        {copyStatus && <p role="status">{copyStatus}</p>}
      </li>
      <li><strong>Nyisd meg a heti étlapot a Teletálon</strong><p>Az étlapon nyisd meg a mentett könyvjelzőt, majd hagyd jóvá a mennyiségeket. Mobilon keresd a böngésző könyvjelzői között vagy a címsorban.</p></li>
      <li><strong>Ellenőrizd a kosarat</strong><p>A parancsikon megnyitja a Teletál-kosarat. Ha szükséges, jelentkezz be, majd add le a rendelést, amikor elkészültél.</p></li>
    </ol>
    <a className="button primary wide" href={url} target="_blank" rel="noreferrer"><ShoppingBasket size={19} /> Heti étlap megnyitása a Teletálon</a>
    <a className="text-button existing-cart" target="_blank" rel="noreferrer" href={cartUrl}>Teletál-kosár megnyitása</a>
  </>;
}

function deliveryDays(catalog) {
  return new Set(catalog.map(dish => dish.day));
}

function CheckedCart({ plan, preferences, onCatalog }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    const aborter = new AbortController();
    const { signal } = aborter;
    loadMenuCatalog(plan.week, signal, true).then(catalog => {
      if (signal.aborted) return;
      const eligible = eligibleDays(plan.week, new Date(), deliveryDays(catalog));
      onCatalog(plan.week, catalog);
      setState({ phase: 'ready', ...orderSummary(plan, eligible, catalog, preferences) });
    }).catch(error => {
      if (!signal.aborted) setState({ phase: 'error', message: error.message });
    });
    return () => aborter.abort();
  }, [plan, preferences, onCatalog, attempt]);

  if (state.phase === 'loading') return <p role="status">Rendelhető tételek ellenőrzése…</p>;
  if (state.phase === 'error') return <p role="alert">{state.message} <button type="button" className="text-button" onClick={() => {
    setState({ phase: 'loading' });
    setAttempt(value => value + 1);
  }}>Újra</button></p>;
  if (!state.lines.length) return <p role="status">A választásaid közül jelenleg egyik sem küldhető a kosárba.</p>;
  return <>
    {Object.keys(state.issues).length > 0 && <p role="status">A kosárba csak a rendelhető és a beállításaidnak megfelelő tételek kerülnek.</p>}
    <CartInstructions plan={plan} lines={state.lines} />
  </>;
}

function Review({ plan, visibleDays, eligible, order, onNotice, onViewDay }) {
  const { issues, total } = order;
  const summary = visibleDays.map(day => {
    const available = eligible.includes(day);
    const option = plan.slots[day];
    const status = !available ? 'Nem rendelhető' : option === null ? 'Kihagyva' : 'Nincs választás';
    return { day, label: days[day - 1], available, option, status, issue: issues[day] };
  });
  const picks = summary.filter(({ option }) => option);
  const hasIssues = Object.keys(issues).length > 0;

  async function copyChecklist() {
    const checklist = [appName + ' · ' + weekLabel(plan.week), ...summary.map(({ day, label, option, status, issue }) => {
      if (!option) return label + ' – ' + status;
      const dishes = option.dishes.map(dish => dish.code + ' ' + dish.name).join(' + ');
      return label + (day > 5 ? ' (pénteki kiszállítás)' : '') + ' – ' + dishes + ' · ' + calories(option.kcal)
        + (issue ? ' · ' + issue : '');
    })].join('\n');
    onNotice(await copyText(checklist) ? 'Étellista a vágólapra másolva' : 'A vágólap nem érhető el. Jelöld ki az étellistát ezen az oldalon.');
  }

  return <main className="review">
    <div className="review-heading">
      <span className="section-icon"><ClipboardList size={23} aria-hidden="true" /></span>
      <div><h1>Heti választásaid</h1><p>{weekLabel(plan.week)} · {picks.length} napra választottál ételt</p></div>
      <button type="button" className="quiet-button review-copy" onClick={copyChecklist} disabled={!picks.length}
        aria-label="Étellista másolása vágólapra" title="Étellista másolása vágólapra">
        <Copy size={17} aria-hidden="true" /><span>Étellista másolása vágólapra</span>
      </button>
    </div>
    <ol className="review-list">
      {summary.map(({ day, label, available, option, status, issue }) => {
        const contents = <>
          <span className="review-day"><strong>{label}</strong>{day > 5 && <span>Pénteki kiszállítás</span>}</span>
          {option ? <>
            <span className="review-meals">
              {option.dishes.map(dish => {
                const singleItem = option.dishes.length === 1;
                const name = singleItem ? dish.menuName || dish.name : dish.name;
                const components = singleItem && option.components?.length ? option.components : dish.components;
                const courseNames = (components?.length ? components.map(course => course.name) : [dish.name])
                  .filter(course => course && course !== name);
                return <span key={dish.id} className="review-menu">
                  <span className="meal-code">{dish.code}</span>
                  <span lang="hu">{name}</span>
                  {courseNames.length > 0 && <span className="review-courses" lang="hu">
                    {courseNames.map((course, index) => <span key={index}>{course}</span>)}
                  </span>}
                </span>;
              })}
              {issue && <span className="selection-issue">{issue}</span>}
            </span>
            <span className="review-numbers"><strong>{calories(option.kcal)}</strong><span>{money(option.price)}</span></span>
          </> : <span className="skipped-label">{status}</span>}
        </>;
        return <li key={day}>
          {available ? <button type="button" className="review-row" onClick={() => onViewDay(day)}>
            {contents}<ChevronRight className="review-open" size={16} aria-hidden="true" />
          </button> : <div className="review-row unavailable">{contents}</div>}
        </li>;
      })}
    </ol>
    {hasIssues && <p className="review-note">A megjelölt választások figyelmet igényelnek. A kosárba a többi választható tétel kerül.</p>}
    <div className="review-total">
      <span>{hasIssues ? 'Küldhető tételek összege' : 'Becsült összeg'}</span><strong>{money(total)}</strong>
    </div>
  </main>;
}

function WeekStatus({ step, week, error, loading, noDaysSelected, onRetry }) {
  const loadingText = week ? 'Étlap betöltése…' : 'Hetek betöltése…';
  return <main className={step === 'overview' ? 'review' : 'picker'}>
    <div className="placeholder-card" role={error ? 'alert' : 'status'}>
      {loading && <span className="spinner" aria-hidden="true" />}
      <h2>{error || (loading ? loadingText : noDaysSelected
        ? 'Válassz rendelési napokat a Hét lépésben.' : 'Erre a hétre már nem rendelhetsz.')}</h2>
      {error && <button type="button" className="button secondary" onClick={onRetry}>Újra</button>}
    </div>
  </main>;
}

function App() {
  const [stored] = useState(savedPlanner);
  const [plan, setPlan] = useState(stored.plan);
  const [preferences, setPreferences] = useState(stored.preferences);
  const [step, setStep] = useState('week');
  const [editingDay, setEditingDay] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [weekDays, setWeekDays] = useState({});
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const [published, setPublished] = useState([]);
  const [weekError, setWeekError] = useState('');
  const [weekAttempt, setWeekAttempt] = useState(0);
  const [catalogRequest, setCatalogRequest] = useState({ phase: 'loading' });
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const updateCatalog = useCallback((week, items) => setCatalogRequest({ week, phase: 'ready', items }), []);

  const weeks = upcomingWeeks(published, calendarNow);
  const weekListError = weekError || (published.length && !weeks.length ? 'Még nincs elérhető következő hét.' : '');
  const recommended = defaultWeek(weeks, calendarNow);
  const week = step === 'week'
    ? weeks.some(item => item.key === selectedWeek) ? selectedWeek : recommended
    : plan?.week ?? recommended;
  const selectedDays = plan?.week === week ? plan.selectedDays : weekDays[week] ?? preferences.defaultDays;
  const activePlan = plan?.week === week ? plan : { week, selectedDays, slots: {}, drafts: {} };
  const catalog = catalogRequest.week === week ? catalogRequest : { phase: 'loading' };
  const availabilityError = week ? catalog.message : weekListError;
  const hasSavedProgress = plan && (Object.keys(plan.slots).length > 0 || Object.keys(plan.drafts).length > 0);
  const availableDays = eligibleDays(week, calendarNow, catalog.items && deliveryDays(catalog.items));
  const eligible = availableDays.filter(day => selectedDays.includes(day));
  const reviewDays = selectedDays.filter(day => eligible.includes(day) || activePlan.slots[day]);
  const day = eligible.includes(activePlan.day) ? activePlan.day : eligible[0];
  const showPicker = step === 'meals' && day && catalog.phase === 'ready';
  const editing = editingDay === day;
  const dayDone = showPicker && !editing && Object.hasOwn(activePlan.slots, day);
  const order = step === 'overview' && catalog.phase === 'ready' && reviewDays.length
    ? orderSummary(activePlan, eligible, catalog.items, preferences) : null;
  const pickerDay = step === 'meals' ? day : null;
  const closeModal = () => setModal(null);
  const retryWeeks = () => { setWeekError(''); setWeekAttempt(value => value + 1); };
  const retryCatalog = () => setCatalogAttempt(value => value + 1);

  useEffect(() => {
    const update = () => setCalendarNow(new Date());
    const timer = setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);

  useEffect(() => {
    const aborter = new AbortController();
    const { signal } = aborter;
    loadJson('/api/weeks', signal).then(available => {
      if (signal.aborted) return;
      setPublished(available);
      if (!available.length) setWeekError('Még nincs közzétett heti étlap.');
    }).catch(error => {
      if (!signal.aborted) setWeekError(error.message);
    });
    return () => aborter.abort();
  }, [weekAttempt]);

  useEffect(() => {
    if (!week) return;
    const aborter = new AbortController();
    const { signal } = aborter;
    setCatalogRequest({ week, phase: 'loading' });
    loadMenuCatalog(week, signal).then(items => {
      if (!signal.aborted) updateCatalog(week, items);
    }).catch(error => {
      if (!signal.aborted) setCatalogRequest({ week, phase: 'error', message: error.message });
    });
    return () => aborter.abort();
  }, [week, catalogAttempt, updateCatalog]);

  useEffect(() => {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences));
      if (plan) localStorage.setItem(storageKey, JSON.stringify(plan));
    } catch {
      setNotice('A böngésző nem tudta menteni a változtatásokat.');
    }
  }, [preferences, plan]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step, week, pickerDay]);

  function openWeek(target, confirmedWeek) {
    if (confirmedWeek && confirmedWeek !== week) {
      closeModal();
      return;
    }
    if (week && !confirmedWeek && hasSavedProgress && plan.week !== week) {
      setModal({ type: 'replacePlan', week, target });
      return;
    }
    if (week && plan?.week !== week) setPlan(startPlan(week, eligible[0] ?? null, selectedDays));
    setEditingDay(null);
    setStep(target);
    closeModal();
  }

  function resetWeek(savedWeek) {
    if (plan?.week === savedWeek) setPlan(startPlan(savedWeek, null, plan.selectedDays));
    setEditingDay(null);
    closeModal();
  }

  function selectDay(nextDay, edit = false) {
    if (!eligible.includes(nextDay)) return;
    setPlan(plan ? { ...plan, day: nextDay } : startPlan(week, nextDay, selectedDays));
    setEditingDay(edit ? nextDay : null);
    setStep('meals');
  }

  function chooseForDay(activeDay, action, option) {
    const orderable = eligibleDays(week, new Date(), deliveryDays(catalog.items)).filter(day => selectedDays.includes(day));
    if (activeDay !== day || !orderable.includes(day)) {
      setCalendarNow(new Date());
      return;
    }
    if (action === 'right' && (!option || selectionIssue(option, day, orderable, catalog.items, preferences))) return;
    if ((action === 'left' || action === 'up') && !option) return;
    const next = choose(plan ? { ...plan, day } : startPlan(week, day, selectedDays), action, option, orderable);
    setPlan(next);
    if (action === 'right' || action === 'skip') {
      setEditingDay(null);
      if (next.day === null) setStep('overview');
    }
  }

  function navigate(target) {
    if (target === step) return;
    if (target === 'week') setSelectedWeek(week);
    else if (step === 'week') {
      openWeek(target);
      return;
    } else if (target === 'meals' && catalog.phase === 'ready' && eligible.length) {
      selectDay(eligible[0]);
      return;
    }
    setStep(target);
  }

  function goNext() {
    if (step === 'overview') setModal({ type: 'cart' });
    else navigate('overview');
  }

  function changeWeekDays(selection) {
    setWeekDays(current => ({ ...current, [week]: selection }));
    if (plan?.week === week) setPlan({ ...plan, selectedDays: selection });
  }

  const dayAction = showPicker ? {
    label: dayDone ? 'Nap szerkesztése' : 'Nap kihagyása',
    onClick: dayDone ? () => selectDay(day, true) : () => chooseForDay(day, 'skip'),
  } : null;

  return <>
    <header className="app-header">
      <div className="header-inner">
        <div className="brand"><span className="brand-icon"><Utensils size={20} /></span><span>{appName}</span></div>
        <div className="header-actions">
          <button type="button" className="quiet-button" aria-label="Beállítások" onClick={() => setModal({ type: 'preferences' })}>
            <SlidersHorizontal size={17} /><span>Beállítások</span>
          </button>
          <InstallButton onHelp={() => setModal({ type: 'install' })} />
        </div>
      </div>
    </header>
    <StepProgress step={step} onNavigate={navigate} />
    {step === 'week' ? <WeekSelection week={week} weeks={weeks} recommended={recommended} weekError={weekListError}
      catalog={catalog} availableDays={availableDays} selectedDays={selectedDays} eligible={eligible} savedWeek={plan?.week}
      onSelect={setSelectedWeek} onDaysChange={changeWeekDays}
      onReset={hasSavedProgress && plan.week === week ? () => setModal({ type: 'resetPlan', week }) : undefined}
      onRetryWeeks={retryWeeks} onRetryCatalog={retryCatalog} onContinue={() => navigate('meals')} />
      : order ? <Review plan={activePlan} visibleDays={reviewDays} eligible={eligible} order={order}
        onNotice={setNotice} onViewDay={selectDay} />
        : showPicker ? <Picker key={week + ':' + day + ':' + editing}
          plan={{ ...activePlan, day }} eligible={eligible} catalog={catalog.items} preferences={preferences} editing={editing} done={dayDone}
          onDay={value => selectDay(value)} onAction={chooseForDay} />
          : <WeekStatus step={step} week={week} error={availabilityError} loading={!availabilityError && catalog.phase !== 'ready'}
            noDaysSelected={availableDays.length > 0 && !eligible.length} onRetry={week ? retryCatalog : retryWeeks} />}
    <StepBar step={step} onBack={() => navigate(step === 'meals' ? 'week' : 'meals')} dayAction={dayAction} onNext={goNext}
      disabled={step === 'week' ? catalog.phase !== 'ready' || !eligible.length : step === 'overview' && !order?.lines.length} />
    {modal?.type === 'preferences' && <Modal name="Beállítások" onClose={closeModal} className="preferences-dialog">
      <PreferencesForm preferences={preferences} week={week} onSave={value => { setPreferences(value); closeModal(); }} />
    </Modal>}
    {modal?.type === 'replacePlan' && <Modal name="Új heti tervet indítasz?" onClose={closeModal}>
      <p>Az új terv felülírja a mentett választásaidat.</p>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={closeModal}>Mégse</button>
        <button type="button" className="button primary" onClick={() => openWeek(modal.target, modal.week)}>Új terv indítása</button>
      </div>
    </Modal>}
    {modal?.type === 'resetPlan' && <Modal name="Újrakezded a heti válogatást?" onClose={closeModal}>
      <p>A hét mentett választásai és válogatási előzményei törlődnek.</p>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={closeModal}>Mégse</button>
        <button type="button" className="button primary" onClick={() => resetWeek(modal.week)}>Újrakezdés</button>
      </div>
    </Modal>}
    {modal?.type === 'install' && <Modal name={`A ${appName} telepítése`} onClose={closeModal}>
      <p><Smartphone size={19} className="inline-icon" /> iPhone-on nyisd meg az oldalt a Safariban, és a Megosztás menüben válaszd a <b>Hozzáadás a Főképernyőhöz</b> lehetőséget. Ha megjelenik, kapcsold be a <b>Megnyitás webappként</b> beállítást.</p>
      <p>Androidon a böngésző menüjében válaszd az <b>Alkalmazás telepítése</b> vagy a <b>Hozzáadás a kezdőképernyőhöz</b> lehetőséget. Számítógépen keresd a telepítési lehetőséget a böngésző menüjében.</p>
    </Modal>}
    {modal?.type === 'cart' && <Modal name="Ételek küldése a Teletál-kosárba" onClose={closeModal}>
      <CheckedCart plan={activePlan} preferences={preferences} onCatalog={updateCatalog} />
    </Modal>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(error => {
    console.info('Service worker registration unavailable', error.message);
  }));
}
