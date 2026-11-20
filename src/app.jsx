import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bookmark, CalendarDays, Check, ChevronDown, ClipboardList, Download, Flame, Pencil,
  RotateCcw, ShoppingBasket, SlidersHorizontal, Smartphone, Soup, Utensils, X,
} from 'lucide-react';
import { CodeFilter } from './CodeFilter.jsx';
import { SwipeCard } from './SwipeCard.jsx';
import { shortcutUrl, teletalWeekUrl } from './cart-shortcut.js';
import { loadDayDishes, loadJson, loadMenuCatalog } from './menu-client.js';
import { calorieLimit, cartLines, choose, dayQueue, days, mealOptions, newSettings, optionTypes, restorePlan, sourceDay, startPlan } from './planning.js';
import { dayLabel, defaultWeek, weekLabel } from './weeks.js';
import './styles.css';

const storageKey = 'talvalogato.plan.v1';
const previousStorageKey = 'meal-deck.plan.v1';
const appName = 'Tálválogató';
const cartUrl = 'https://www.teletal.hu/kosar';
const actions = [
  { direction: 'left', label: 'Passz', Icon: X },
  { direction: 'up', label: 'Talán', Icon: Bookmark },
  { direction: 'right', label: 'Kiválasztom', Icon: Check },
];
const shortDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
const mealBadges = Object.fromEntries(optionTypes.map(type => [type.id, type.badge]));
const coursePlaceholders = {
  soup: '/meal-placeholder-soup.webp',
  main: '/meal-placeholder-main.webp',
  third: '/meal-placeholder-third.webp',
};
const number = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
const money = value => `${number.format(value)}\u00a0Ft`;
const calories = value => `${number.format(value)}\u00a0kcal`;

function savedPlan() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem(previousStorageKey));
    if (value?.id && value.settings?.week && Number.isInteger(value.day)) return restorePlan(value);
  } catch {
    return null;
  }
  return null;
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

function Setup({ settings, setSettings, weeks, weekError, onRetry, onStart, onResume, onFilterCodes, hasPlan, canContinue }) {
  const change = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const selected = weeks.some(week => week.key === settings.week);
  const types = settings.types ?? newSettings.types;
  const excludedCount = settings.excludedCodes?.length ?? 0;
  const limit = calorieLimit(settings);
  const validBudget = Number.isInteger(settings.calories) && settings.calories >= 1
    && Number.isFinite(settings.tolerance) && settings.tolerance >= 0 && settings.tolerance <= 100
    && Number.isFinite(limit);
  const valid = selected && validBudget && types.length > 0;
  const next = defaultWeek(weeks);

  return <div className="setup-grid">
    <section className="welcome">
      <div className="welcome-copy">
        <span className="eyebrow dark-eyebrow"><Utensils size={16} /> Heti ételtervező</span>
        <h1>Válogasd össze<br className="desktop-break" /> a heti ételeidet!</h1>
        <p>Válogass a kalóriakeretedbe illő Teletál-menük, saját összeállítások és önálló ételek közül.</p>
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

    <form className="settings-card" onSubmit={event => {
      event.preventDefault();
      if (valid) onStart();
    }}>
      <div className="settings-heading">
        <span className="section-icon"><SlidersHorizontal size={21} /></span>
        <div><h2>Heti beállítások</h2><p>Válassz hetet, és állítsd be a napi kalóriacélodat.</p></div>
      </div>

      <label htmlFor="week">Kiszállítás hete</label>
      <div className="select-wrap">
        <CalendarDays size={18} aria-hidden="true" />
        <select id="week" value={selected ? settings.week : ''} onChange={event => change('week', event.target.value)}>
          {!selected && <option value="">{weekError ? 'A hetek nem érhetők el' : 'Hetek betöltése…'}</option>}
          {weeks.map(week => <option key={week.key} value={week.key}>
            {weekLabel(week.key)}{week.key === next ? ' (alapértelmezett)' : ''}
          </option>)}
        </select>
        <ChevronDown size={18} aria-hidden="true" />
      </div>
      {weekError && <div className="form-error" role="alert">{weekError} <button type="button" className="text-button" onClick={onRetry}>Újra</button></div>}

      <div className="number-fields">
        <label htmlFor="target">Napi kalóriacél
          <span className="field-wrap">
            <input id="target" type="number" inputMode="numeric" min="1" step="1" required
              value={settings.calories} onChange={event => change('calories', event.target.value === '' ? '' : event.target.valueAsNumber)} />
            <span>kcal</span>
          </span>
        </label>
        <label htmlFor="tolerance">Ráhagyás
          <span className="field-wrap">
            <input id="tolerance" type="number" inputMode="decimal" min="0" max="100" step="0.5" required
              value={settings.tolerance} onChange={event => change('tolerance', event.target.value === '' ? '' : event.target.valueAsNumber)} />
            <span>%</span>
          </span>
        </label>
      </div>
      <div className="budget-note">
        <Flame size={19} aria-hidden="true" />
        <div><strong>{validBudget ? `Naponta legfeljebb ${calories(limit)}` : 'Napi kalóriakeret'}</strong>
          <p>{validBudget ? 'A ráhagyás ennyivel emeli a napi kalóriakeretedet.' : Number.isFinite(limit)
            ? 'Adj meg egy pozitív egész kalóriacélt és 0–100% ráhagyást.' : 'A kiszámított kalóriakeret túl nagy.'}</p></div>
      </div>
      <fieldset className="option-types">
        <legend>Mutatott ételtípusok</legend>
        <p>A bejelölt típusok ebben a sorrendben jelennek meg.</p>
        {optionTypes.map(({ id, label }) => <label key={id}>
          <input type="checkbox" checked={types.includes(id)} onChange={event => {
            change('types', event.target.checked ? [...types, id] : types.filter(type => type !== id));
          }} />
          {label}
        </label>)}
        {!types.length && <p className="form-error" role="status">A folytatáshoz jelölj be legalább egy típust.</p>}
      </fieldset>
      <button type="button" className="code-filter-trigger" aria-haspopup="dialog" disabled={!selected} onClick={onFilterCodes}>
        <span>Teletál-kódok szűrése</span>
        <span>{excludedCount ? `${number.format(excludedCount)} kód kizárva` : 'Minden kód'}</span>
      </button>
      <button className="button primary wide" disabled={!valid} type="submit">
        {canContinue ? 'Válogatás folytatása' : 'Válogatás indítása'}
      </button>
      {hasPlan && <button type="button" className="text-button resume" onClick={onResume}>Vissza a mentett tervhez</button>}
    </form>
  </div>;
}

function WeekProgress({ plan, onSelect }) {
  return <ol aria-label="A heti válogatás állása" className="week-progress">
    {days.map((day, index) => {
      const dayNumber = index + 1;
      const active = plan.day === dayNumber;
      const done = Object.hasOwn(plan.slots, dayNumber);
      const picked = Boolean(plan.slots[dayNumber]);
      return <li key={day}><button type="button" aria-current={active ? 'step' : undefined}
        aria-label={`${day}${done ? picked ? ', étel kiválasztva' : ', kihagyva' : ''}`}
        className={done ? picked ? 'picked' : 'skipped' : undefined}
        onClick={() => onSelect(dayNumber)}>
        {picked && <Check size={13} aria-hidden="true" />}<span>{shortDays[index]}</span>
      </button></li>;
    })}
  </ol>;
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
  const refreshPhotos = merchantMenu && !components?.some(course => Object.hasOwn(course, 'photo'));
  const refreshLabels = dishes.some(item => !Object.hasOwn(item, 'menuName') || !Object.hasOwn(item, 'cuisine'));

  useEffect(() => {
    if (!refreshPhotos) return;
    const aborter = new AbortController();
    const { signal } = aborter;
    // Saved menus from earlier versions have only the first photo.
    loadDayDishes(week, dish.day, [dish], signal, () => {}).then(({ dishes: [refreshed] }) => {
      if (!signal.aborted && refreshed) setRefreshedCourses(refreshed.components);
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
  const { menuName, cuisine } = menuDishes[0];
  const showCuisine = cuisine && menuDishes.every(item => item.cuisine === cuisine);
  const fallbackHeading = hasCodes ? `Menü ${codes.join(' + ')}` : hasCourses ? 'Menü' : title;
  const heading = merchantMenu && menuName && dish.code ? `${menuName} (${dish.code})` : fallbackHeading;
  const courses = refreshedCourses ?? components;
  // A legacy cover photo has no course association until the refreshed data arrives.
  const hasLegacyCover = refreshPhotos && !refreshedCourses && option.photo;
  const coverCourses = customCombo || kind === 'single' || hasLegacyCover || !courses?.length ? dishes : courses;
  const [failed, setFailed] = useState([]);
  return <article className="meal-card">
    <div className={`meal-cover${coverCourses.length === 2 ? ' split-cover' : ''}`}>
      {coverCourses.map((course, index) => {
        const photo = course.photo ?? (coverCourses.length === 1 ? option.photo : null);
        const showPhoto = photo && !failed.includes(photo);
        const placeholder = coursePlaceholders[course.kind] ?? coursePlaceholders.third;
        return <img key={index} className={showPhoto ? undefined : 'course-placeholder'}
          src={showPhoto ? photo : placeholder} alt={showPhoto ? '' : 'Illusztráció, a fogás fotója nem érhető el'}
          draggable="false" onError={showPhoto ? () => setFailed(current => [...current, photo]) : undefined} />;
      })}
      <div className="meal-tags">
        <span className={`meal-tag ${customCombo ? 'tag-pair' : merchantMenu ? 'tag-menu' : ''}`}>
          {customCombo ? <Soup size={16} /> : <Utensils size={15} />} {mealBadges[kind]}
        </span>
        {showCuisine && <span className="meal-tag tag-cuisine">{cuisine}</span>}
      </div>
    </div>
    <div className="meal-content">
      <h2 lang="hu">{heading}</h2>
      {hasCourses && <ul className="course-list" aria-label="A menü fogásai">
        {components.map((part, index) => <li key={index}>
          <span lang="hu">{part.name}</span><span>{calories(part.kcal)}</span>
        </li>)}
      </ul>}
      <div className="meal-meta">
        <span className={`calorie-badge${kcal > target ? ' over-target' : ''}`}><Flame size={17} />{calories(kcal)}</span>
        <span>{money(price)}</span>
      </div>
    </div>
  </article>;
}

function Picker({ plan, updatePlan }) {
  const card = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [animation, setAnimation] = useState(0);
  const [state, setState] = useState({ phase: 'loading', progress: [0, 0] });
  const week = plan.settings.week;
  const providerDay = sourceDay(plan.day);
  const done = Object.hasOwn(plan.slots, plan.day);
  const picked = plan.slots[plan.day];
  const loading = state.phase === 'loading' || state.key !== `${week}:${providerDay}`;

  useEffect(() => {
    if (done) return;
    const aborter = new AbortController();
    const { signal } = aborter;
    const key = `${week}:${providerDay}`;
    setState({ phase: 'loading', progress: [0, 0], key });
    async function load() {
      try {
        const catalog = await loadMenuCatalog(week, signal);
        const { dishes, unavailable, failures } = await loadDayDishes(week, providerDay,
          catalog.filter(dish => dish.day === providerDay), signal, (current, total) => {
            if (!signal.aborted) setState({ phase: 'loading', progress: [current, total], key });
          });
        if (signal.aborted) return;
        if (!dishes.length && failures) throw new Error('Nem sikerült betölteni a Teletál tápértékadatait.');
        setState({ phase: 'ready', dishes, unavailable, failures, key });
      } catch (error) {
        if (!signal.aborted) setState({ phase: 'error', message: error.message, key });
      }
    }
    load();
    return () => aborter.abort();
  }, [week, providerDay, attempt, done]);

  const options = useMemo(() => done || loading || !state.dishes ? [] : mealOptions(state.dishes, plan.settings),
    [done, loading, state.dishes, plan.settings]);
  const emptyFromCodes = useMemo(() => !done && !loading && state.dishes && !options.length && plan.settings.excludedCodes?.length
    && mealOptions(state.dishes, { ...plan.settings, excludedCodes: [] }).length > 0,
    [done, loading, options.length, state.dishes, plan.settings]);
  const queue = useMemo(() => dayQueue(options, plan), [options, plan]);
  const top = queue[0];
  const retry = () => setAttempt(value => value + 1);
  const act = direction => {
    setAnimation(value => value + 1);
    updatePlan(current => current === plan ? choose(current, direction, top) : current);
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

  return <main className="picker">
    <WeekProgress plan={plan} onSelect={day => updatePlan(current => current.day === day ? current : { ...current, day })} />
    <div className="picker-heading">
      <div><h1>{days[plan.day - 1]}</h1><p>{dayLabel(week, plan.day)}
        {plan.day > 5 && ' · A pénteki étlapról'}</p></div>
      <span className="day-budget"><Flame size={18} /> Max. {calories(calorieLimit(plan.settings))}</span>
    </div>
    <div className="deck">
      {done ? picked ? <MealCard key={`${plan.day}:${picked.id}`} option={picked} target={plan.settings.calories} week={week} />
        : <div className="placeholder-card"><h2>Kihagytad ezt a napot</h2></div>
      : loading ? <div className="placeholder-card" role="status">
        <span className="spinner" aria-hidden="true" />
        <h2>Étlap betöltése…</h2>
        {state.progress?.[1] > 0 && <p>{state.progress[1]} ételből {state.progress[0]} tápértékadata ellenőrizve</p>}
      </div> : state.phase === 'error' ? <div className="placeholder-card" role="status">
        <span className="section-icon"><Soup size={25} /></span>
        <h2>Az étlap nem érhető el</h2><p>{state.message}</p>
        <button type="button" className="button secondary" onClick={retry}>Étlap újratöltése</button>
      </div> : !top ? <div className="placeholder-card" role="status">
        <span className="section-icon"><Utensils size={25} /></span>
        <h2>{options.length ? 'Elfogytak a lehetőségek'
          : emptyFromCodes ? 'A kódszűrő minden lehetőséget kizárt' : 'Nincs a beállításaidnak megfelelő étel'}</h2>
        <p>{options.length ? 'Kezdd újra a napot, ha újra megnéznéd az ételeket, vagy hagyd ki ezt a napot.'
          : emptyFromCodes ? 'A beállításokban újra engedélyezhetsz kódokat, vagy kihagyhatod ezt a napot.'
            : 'Kihagyhatod ezt a napot, vagy módosíthatod a kalóriakeretet és az ételtípusokat a beállításokban.'}</p>
        {options.length > 0 && <button type="button" className="button secondary" onClick={() => act('restart')}>
          <RotateCcw size={17} /> Nap újrakezdése
        </button>}
      </div> : <>
        {queue.length > 1 && <div className="card-backing" aria-hidden="true" />}
        <SwipeCard key={`${plan.day}:${top.id}:${animation}`} ref={card} actions={actions} onAction={act}>
          <MealCard option={top} target={plan.settings.calories} week={week} />
        </SwipeCard>
      </>}
    </div>
    {top && <div className="deck-actions" aria-label="Étel kiválasztása vagy kihagyása">
      {actions.map(({ direction, label, Icon }) => <button type="button" key={direction} className={`decision decision-${direction}`}
        onClick={() => card.current?.swipe(direction)}>
        <span className="decision-icon"><Icon size={23} strokeWidth={2.2} /></span><span>{label}</span>
      </button>)}
    </div>}
    {done ? <div className="day-links completed-day-actions">
      <button type="button" className="button secondary" onClick={() => act('restart')}>
        <RotateCcw size={17} /> Meggondoltam magam
      </button>
    </div> : <div className="day-links">
      {top && <span aria-live="polite">{number.format(queue.length)} lehetőség maradt</span>}
      <button type="button" className="text-button" onClick={() => act('skip')}>Nap kihagyása</button>
    </div>}
    {!done && !loading && state.unavailable > 0 && <p className="nutrition-note">
      {number.format(state.unavailable)} ételhez nem érhető el kalóriaadat.
      {state.failures > 0 && <button type="button" className="text-button" onClick={retry}>Adatok újratöltése</button>}
    </p>}
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
        {lines.length > 14 && <p>Ha az első változatot mentetted el, egyszer frissítsd a könyvjelzőt a 14-nél több különböző tételt tartalmazó kosarakhoz.</p>}
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

function Review({ plan, onCart, onNotice, onEditDay, onRestart, onNew }) {
  const lines = useMemo(() => cartLines(plan), [plan]);
  const picks = Object.values(plan.slots).filter(Boolean);
  const total = picks.reduce((sum, option) => sum + option.price, 0);

  async function copyChecklist() {
    const checklist = [`${appName} · ${weekLabel(plan.settings.week)}`, ...days.map((day, index) => {
      const option = plan.slots[index + 1];
      if (!option) return `${day} – kihagyva`;
      return `${day}${index >= 5 ? ' (pénteki kiszállítás)' : ''} – ${option.dishes.map(dish => `${dish.code} ${dish.name}`).join(' + ')} · ${calories(option.kcal)}`;
    })].join('\n');
    onNotice(await copyText(checklist) ? 'Étellista a vágólapra másolva' : 'A vágólap nem érhető el. Jelöld ki az étellistát ezen az oldalon.');
  }

  return <main className="review">
    <div className="review-heading">
      <span className="section-icon"><ClipboardList size={23} /></span>
      <div><h1>Heti választásaid</h1><p>{weekLabel(plan.settings.week)} · {picks.length}/7 napra választottál ételt</p></div>
    </div>
    <ol className="review-list">
      {days.map((day, index) => {
        const option = plan.slots[index + 1];
        return <li key={day}>
          <button type="button" className="review-row" onClick={() => onEditDay(index + 1)}>
            <span className="review-day"><strong>{day}</strong>{index > 4 && <span>Pénteki kiszállítás</span>}</span>
            {option ? <>
              <span className="review-meals">
                {option.dishes.map(dish => <span key={dish.id}><span className="meal-code">{dish.code}</span><span lang="hu">{dish.name}</span></span>)}
              </span>
              <span className="review-numbers"><strong>{calories(option.kcal)}</strong><span>{money(option.price)}</span></span>
            </> : <span className="skipped-label">Kihagyva</span>}
            <Pencil className="review-edit" size={16} role="img" aria-label="Szerkesztés" />
          </button>
        </li>;
      })}
    </ol>
    <div className="cart-footer">
      <div><span>Becsült összeg</span><strong>{money(total)}</strong></div>
      <button type="button" className="button primary" onClick={() => onCart(lines)} disabled={!lines.length}>
        <ShoppingBasket size={20} /> Teletál-kosárba
      </button>
    </div>
    <div className="review-links">
      <button type="button" className="text-button" onClick={copyChecklist} disabled={!lines.length}>Étellista másolása</button>
      <button type="button" className="text-button" onClick={onRestart}><RotateCcw size={16} /> Hét újrakezdése</button>
      <button type="button" className="text-button" onClick={onNew}>Új heti terv</button>
    </div>
  </main>;
}

function App() {
  const [plan, setPlan] = useState(savedPlan);
  const [setup, setSetup] = useState(!plan);
  const [settings, setSettings] = useState(() => plan?.settings ?? newSettings);
  const [weeks, setWeeks] = useState([]);
  const [weekError, setWeekError] = useState('');
  const [weekAttempt, setWeekAttempt] = useState(0);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const picking = plan?.day <= days.length;
  const canContinue = picking && ['week', 'calories', 'tolerance'].every(key => settings[key] === plan.settings[key]);
  const closeModal = () => setModal(null);

  useEffect(() => {
    if (!setup || weeks.length) return;
    const aborter = new AbortController();
    setWeekError('');
    loadJson('/api/weeks', aborter.signal).then(published => {
      if (!published.length) throw new Error('Még nincs közzétett heti étlap.');
      setWeeks(published);
      setSettings(value => published.some(week => week.key === value.week)
        ? value : { ...value, week: defaultWeek(published) });
    }).catch(error => {
      if (!aborter.signal.aborted) setWeekError(error.message);
    });
    return () => aborter.abort();
  }, [setup, weekAttempt, weeks.length]);

  useEffect(() => {
    if (!plan) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(plan));
      localStorage.removeItem(previousStorageKey);
    } catch {
      setNotice('A böngésző nem tudta menteni az ételtervet.');
    }
  }, [plan]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [setup, plan?.id, plan?.day]);

  function openSettings() {
    setSettings(plan.settings);
    setSetup(true);
  }

  function begin(settings) {
    setPlan(startPlan(settings));
    setSetup(false);
    setModal(null);
  }

  function start() {
    if (canContinue) {
      setPlan(current => ({ ...current, settings }));
      setSetup(false);
    } else if (plan) {
      setModal({ type: 'replacePlan', settings });
    } else {
      begin(settings);
    }
  }

  return <>
    <header className="app-header">
      <div className="header-inner">
        <div className="brand"><span className="brand-icon"><Utensils size={20} /></span><span>{appName}</span></div>
        <div className="header-actions">
          {!setup && <button type="button" className="quiet-button" aria-label="Beállítások" onClick={openSettings}>
            <SlidersHorizontal size={17} /><span>Beállítások</span>
          </button>}
          <InstallButton onHelp={() => setModal({ type: 'install' })} />
        </div>
      </div>
    </header>
    {setup ? <main className="setup">
      <Setup settings={settings} setSettings={setSettings} weeks={weeks} weekError={weekError}
        onRetry={() => setWeekAttempt(value => value + 1)} onStart={start} onResume={() => setSetup(false)}
        onFilterCodes={() => setModal({ type: 'codes' })}
        hasPlan={Boolean(plan)} canContinue={canContinue} />
    </main> : picking ? <Picker plan={plan} updatePlan={setPlan} />
      : <Review plan={plan} onCart={lines => setModal({ type: 'cart', lines })} onNotice={setNotice}
        onEditDay={day => setPlan(current => choose({ ...current, day }, 'restart'))}
        onRestart={openSettings}
        onNew={() => { setSettings({ ...plan.settings, week: defaultWeek(weeks) ?? plan.settings.week }); setSetup(true); }} />}
    {modal?.type === 'codes' && <Modal name="Teletál-kódok szűrése" onClose={closeModal} className="code-filter-dialog">
      <CodeFilter week={settings.week} excludedCodes={settings.excludedCodes ?? []} onClose={closeModal}
        onChange={excludedCodes => setSettings(current => ({ ...current, excludedCodes }))} />
    </Modal>}
    {modal?.type === 'replacePlan' && <Modal name="Új heti tervet indítasz?" onClose={closeModal}>
      <p>Az új terv felülírja a mentett választásaidat.</p>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={closeModal}>Mégse</button>
        <button type="button" className="button primary" onClick={() => begin(modal.settings)}>Új terv indítása</button>
      </div>
    </Modal>}
    {modal?.type === 'install' && <Modal name={`A ${appName} telepítése`} onClose={closeModal}>
      <p><Smartphone size={19} className="inline-icon" /> iPhone-on nyisd meg az oldalt a Safariban, és a Megosztás menüben válaszd a <b>Hozzáadás a Főképernyőhöz</b> lehetőséget. Ha megjelenik, kapcsold be a <b>Megnyitás webappként</b> beállítást.</p>
      <p>Androidon a böngésző menüjében válaszd az <b>Alkalmazás telepítése</b> vagy a <b>Hozzáadás a kezdőképernyőhöz</b> lehetőséget. Számítógépen keresd a telepítési lehetőséget a böngésző menüjében.</p>
    </Modal>}
    {modal?.type === 'cart' && <Modal name="Ételek küldése a Teletál-kosárba" onClose={closeModal}>
      <CartInstructions plan={plan} lines={modal.lines} />
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
