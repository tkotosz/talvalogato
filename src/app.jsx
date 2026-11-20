import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bookmark, CalendarDays, Check, ChevronDown, ClipboardList, Download, Flame,
  RotateCcw, ShoppingBasket, SlidersHorizontal, Smartphone, Soup, Utensils, X,
} from 'lucide-react';
import { SwipeCard } from './SwipeCard.jsx';
import { shortcutUrl, teletalWeekUrl } from './cart-shortcut.js';
import { courseDataQuery, loadDayDishes, loadJson } from './menu-client.js';
import { calorieLimit, cartLines, choose, dayQueue, days, mealOptions, newSettings, optionTypes, sourceDay, startPlan } from './planning.js';
import { dayLabel, defaultWeek, weekLabel } from './weeks.js';
import './styles.css';

const storageKey = 'meal-deck.plan.v1';
const appName = 'Teletál Meal Picker';
const cartUrl = 'https://www.teletal.hu/kosar';
const actions = [
  { direction: 'left', label: 'Pass', Icon: X },
  { direction: 'up', label: 'Maybe', Icon: Bookmark },
  { direction: 'right', label: 'Pick', Icon: Check },
];
const mealBadges = Object.fromEntries(optionTypes.map(type => [type.id, type.badge]));
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const money = value => `${number.format(value)} Ft`;
const calories = value => `${number.format(value)} kcal`;

function savedPlan() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value?.id && value.settings?.week && Number.isInteger(value.day)) return value;
  } catch {
    return null;
  }
  return null;
}

function Modal({ name, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-content">
      <button type="button" className="icon-button close-modal" onClick={onClose} aria-label="Close"><X size={20} /></button>
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
  return <button type="button" className="quiet-button" aria-label="Install app" onClick={async () => {
    if (!prompt) return onHelp();
    setPrompt(null);
    await prompt.prompt();
  }}><Download size={17} /> <span>Install app</span></button>;
}

function Setup({ settings, setSettings, weeks, weekError, onRetry, onStart, onResume, hasPlan, canContinue }) {
  const change = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const selected = weeks.some(week => week.key === settings.week);
  const types = settings.types ?? newSettings.types;
  const validBudget = settings.calories >= 1 && settings.calories <= 10_000
    && settings.tolerance !== '' && settings.tolerance >= 0 && settings.tolerance <= 100;
  const valid = selected && validBudget && types.length > 0;
  const next = defaultWeek(weeks);

  return <div className="setup-grid">
    <section className="welcome">
      <div className="welcome-copy">
        <span className="eyebrow dark-eyebrow"><Utensils size={16} /> Weekly meal planner</span>
        <h1>Pick your meals<br className="desktop-break" /> for the week.</h1>
        <p>Swipe through Teletál set menus, meal combos, and single dishes that fit your calorie budget.</p>
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
        <div><h2>Your week</h2><p>Choose the week and calorie budget.</p></div>
      </div>

      <label htmlFor="week">Delivery week</label>
      <div className="select-wrap">
        <CalendarDays size={18} aria-hidden="true" />
        <select id="week" value={selected ? settings.week : ''} onChange={event => change('week', event.target.value)}>
          {!selected && <option value="">{weekError ? 'Weeks unavailable' : 'Loading weeks…'}</option>}
          {weeks.map(week => <option key={week.key} value={week.key}>
            {weekLabel(week.key)}{week.key === next ? ' (default)' : ''}
          </option>)}
        </select>
        <ChevronDown size={18} aria-hidden="true" />
      </div>
      {weekError && <div className="form-error" role="alert">{weekError} <button type="button" className="text-button" onClick={onRetry}>Retry</button></div>}

      <div className="number-fields">
        <label htmlFor="target">Calorie target
          <span className="field-wrap">
            <input id="target" type="number" inputMode="numeric" min="1" max="10000" step="1" required
              value={settings.calories} onChange={event => change('calories', event.target.value === '' ? '' : event.target.valueAsNumber)} />
            <span>kcal</span>
          </span>
        </label>
        <label htmlFor="tolerance">Tolerance
          <span className="field-wrap">
            <input id="tolerance" type="number" inputMode="decimal" min="0" max="100" step="0.5" required
              value={settings.tolerance} onChange={event => change('tolerance', event.target.value === '' ? '' : event.target.valueAsNumber)} />
            <span>%</span>
          </span>
        </label>
      </div>
      <div className="budget-note">
        <Flame size={19} aria-hidden="true" />
        <div><strong>{validBudget ? `Up to ${calories(calorieLimit(settings))} per day` : 'Daily calorie limit'}</strong>
          <p>The tolerance allows picks above your target.</p></div>
      </div>
      <fieldset className="option-types">
        <legend>Show in the deck</legend>
        <p>Enabled options appear in this order.</p>
        {optionTypes.map(({ id, label }) => <label key={id}>
          <input type="checkbox" checked={types.includes(id)} onChange={event => {
            change('types', event.target.checked ? [...types, id] : types.filter(type => type !== id));
          }} />
          {label}
        </label>)}
        {!types.length && <p className="form-error" role="status">Enable at least one option type to continue.</p>}
      </fieldset>
      <button className="button primary wide" disabled={!valid} type="submit">
        {canContinue ? 'Continue picking' : 'Start picking'}
      </button>
      {hasPlan && <button type="button" className="text-button resume" onClick={onResume}>Return to saved plan</button>}
    </form>
  </div>;
}

function WeekProgress({ plan }) {
  return <ol aria-label="Week progress" className="week-progress">
    {days.map((day, index) => {
      const active = plan.day === index + 1;
      const done = Object.hasOwn(plan.slots, index + 1);
      const picked = Boolean(plan.slots[index + 1]);
      return <li key={day} aria-current={active ? 'step' : undefined}
        aria-label={`${day}${done ? picked ? ', picked' : ', skipped' : ''}`}
        className={active ? 'current' : done ? picked ? 'picked' : 'skipped' : ''}>
        {picked && <Check size={13} aria-hidden="true" />}<span>{day.slice(0, 3)}</span>
      </li>;
    })}
  </ol>;
}

function MealCard({ option, target }) {
  const { kind, title, components, dishes, kcal, price } = option;
  const customCombo = dishes.length > 1;
  const photos = (customCombo ? dishes.map(dish => dish.photo) : [option.photo]).filter(Boolean);
  const [visible, setVisible] = useState(photos);
  return <article className="meal-card">
    <div className={`meal-cover ${visible.length === 3 ? 'triple-cover' : visible.length === 2 ? 'split-cover' : ''}`}>
      {visible.length > 0 ? visible.map((url, index) =>
        <img key={url + index} src={url} alt="" draggable="false"
          onError={() => setVisible(current => current.filter(photo => photo !== url))} />)
        : <div className="cover-fallback"><Utensils size={53} strokeWidth={1.3} /></div>}
      <span className={`meal-tag ${customCombo ? 'tag-pair' : kind.startsWith('menu') ? 'tag-menu' : ''}`}>
        {customCombo ? <Soup size={16} /> : <Utensils size={15} />} {mealBadges[kind]}
      </span>
    </div>
    <div className="meal-content">
      <h2 lang="hu">{title}</h2>
      {kind !== 'single' && components?.length > 0 && <ul className="course-list" aria-label="Included dishes">
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
  const catalogByWeek = useRef(new Map());
  const card = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [animation, setAnimation] = useState(0);
  const [state, setState] = useState({ phase: 'loading', progress: [0, 0] });
  const week = plan.settings.week;
  const providerDay = sourceDay(plan.day);
  const loading = state.phase === 'loading' || state.key !== `${week}:${providerDay}`;

  useEffect(() => {
    const aborter = new AbortController();
    const { signal } = aborter;
    const key = `${week}:${providerDay}`;
    setState({ phase: 'loading', progress: [0, 0], key });
    async function load() {
      try {
        let catalog = catalogByWeek.current.get(week);
        if (!catalog) {
          catalog = await loadJson(`/api/menu?week=${week}&${courseDataQuery}`, signal);
          catalogByWeek.current.set(week, catalog);
        }
        const { dishes, unavailable, failures } = await loadDayDishes(week, providerDay,
          catalog.filter(dish => dish.day === providerDay), signal, (current, total) => {
            if (!signal.aborted) setState({ phase: 'loading', progress: [current, total], key });
          });
        if (signal.aborted) return;
        if (!dishes.length && failures) throw new Error('Teletál’s calorie details could not be loaded.');
        setState({ phase: 'ready', dishes, unavailable, failures, key });
      } catch (error) {
        if (!signal.aborted) setState({ phase: 'error', message: error.message, key });
      }
    }
    load();
    return () => aborter.abort();
  }, [week, providerDay, attempt]);

  const options = useMemo(() => loading || !state.dishes ? [] : mealOptions(state.dishes, plan.settings),
    [loading, state.dishes, plan.settings]);
  const queue = useMemo(() => dayQueue(options, plan), [options, plan]);
  const top = queue[0];
  const retry = () => setAttempt(value => value + 1);
  const act = direction => {
    setAnimation(value => value + 1);
    updatePlan(current => current.day === plan.day ? choose(current, direction, top) : current);
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
    <WeekProgress plan={plan} />
    <div className="picker-heading">
      <div><h1>{days[plan.day - 1]}</h1><p>{dayLabel(week, plan.day).replace(/^\w+,?\s*/, '')}
        {plan.day > 5 && ' · Pick from Friday’s menu'}</p></div>
      <span className="day-budget"><Flame size={18} /> {calories(calorieLimit(plan.settings))} max</span>
    </div>
    <div className="deck">
      {loading ? <div className="placeholder-card" role="status">
        <span className="spinner" aria-hidden="true" />
        <h2>Loading {plan.day > 5 ? 'Friday’s' : `${days[plan.day - 1]}’s`} menu</h2>
        {state.progress?.[1] > 0 && <p>Checked {state.progress[0]} of {state.progress[1]} nutrition listings</p>}
      </div> : state.phase === 'error' ? <div className="placeholder-card" role="status">
        <span className="section-icon"><Soup size={25} /></span>
        <h2>Menu unavailable</h2><p>{state.message}</p>
        <button type="button" className="button secondary" onClick={retry}>Retry menu</button>
      </div> : !top ? <div className="placeholder-card" role="status">
        <span className="section-icon"><Utensils size={25} /></span>
        <h2>{options.length ? 'You’ve seen every option' : 'No meals match your settings'}</h2>
        <p>{options.length ? 'Restart the day to see the passed options again, or skip it.'
          : 'You can skip this day or change your calorie budget or option types in Settings.'}</p>
        {options.length > 0 && <button type="button" className="button secondary" onClick={() => act('restart')}>
          <RotateCcw size={17} /> Restart day
        </button>}
      </div> : <>
        {queue.length > 1 && <div className="card-backing" aria-hidden="true" />}
        <SwipeCard key={`${plan.day}:${top.id}:${animation}`} ref={card} actions={actions} onAction={act}>
          <MealCard option={top} target={plan.settings.calories} />
        </SwipeCard>
      </>}
    </div>
    {top && <div className="deck-actions" aria-label="Meal actions">
      {actions.map(({ direction, label, Icon }) => <button type="button" key={direction} className={`decision decision-${direction}`}
        onClick={() => card.current?.swipe(direction)}>
        <span className="decision-icon"><Icon size={23} strokeWidth={2.2} /></span><span>{label}</span>
      </button>)}
    </div>}
    <div className="day-links">
      {top && <span aria-live="polite">{queue.length} {queue.length === 1 ? 'option' : 'options'} left</span>}
      <button type="button" className="text-button" onClick={() => act('skip')}>Skip day</button>
    </div>
    {!loading && state.unavailable > 0 && <p className="nutrition-note">
      {state.unavailable} {state.unavailable === 1 ? 'dish has' : 'dishes have'} no calorie data available.
      {state.failures > 0 && <button type="button" className="text-button" onClick={retry}>Retry details</button>}
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
    <p>Use a browser bookmark to add your picks on Teletál. Save the shortcut once, then reuse it each week.</p>
    <ol className="instructions">
      <li>
        <strong>Save the cart shortcut</strong>
        <p>Create a bookmark called <b>Teletál cart shortcut</b> and replace its URL with the copied shortcut. On desktop you can also drag this shortcut into your bookmarks bar.</p>
        {lines.length > 14 && <p>If you saved the original shortcut, replace it once to support carts with more than 14 items.</p>}
        <a ref={link => link?.setAttribute('href', shortcut)} className="drag-bookmark" onClick={event => {
          event.preventDefault();
          copyText(shortcut).then(ok => setCopyStatus(ok ? 'Shortcut copied' : 'Drag the shortcut into your bookmarks bar.'));
        }}><Bookmark size={16} /> Copy or drag cart shortcut</a>
        {copyStatus && <p role="status">{copyStatus}</p>}
      </li>
      <li><strong>Open the week on Teletál</strong><p>While on that page, run your saved cart bookmark and confirm the quantities. On mobile, use your browser’s bookmarks menu or search for the saved bookmark in the address bar.</p></li>
      <li><strong>Review your cart and sign in</strong><p>The shortcut opens your Teletál cart. Sign in there if needed and finish checkout when you’re ready.</p></li>
    </ol>
    <a className="button primary wide" href={url} target="_blank" rel="noreferrer"><ShoppingBasket size={19} /> Open week on Teletál</a>
    <a className="text-button existing-cart" target="_blank" rel="noreferrer" href={cartUrl}>Open existing Teletál cart</a>
  </>;
}

function Review({ plan, onCart, onNotice, onNew }) {
  const lines = useMemo(() => cartLines(plan), [plan]);
  const picks = Object.values(plan.slots).filter(Boolean);
  const total = picks.reduce((sum, option) => sum + option.price, 0);

  async function copyChecklist() {
    const checklist = [`${appName} · ${weekLabel(plan.settings.week)}`, ...days.map((day, index) => {
      const option = plan.slots[index + 1];
      if (!option) return `${day} — skipped`;
      return `${day}${index >= 5 ? ' (order for Friday)' : ''} — ${option.dishes.map(dish => `${dish.code} ${dish.name}`).join(' + ')} · ${calories(option.kcal)}`;
    })].join('\n');
    onNotice(await copyText(checklist) ? 'Meal list copied' : 'Clipboard unavailable. You can select the meal list on this page.');
  }

  return <main className="review">
    <div className="review-heading">
      <span className="section-icon"><ClipboardList size={23} /></span>
      <div><h1>Your weekly picks</h1><p>{weekLabel(plan.settings.week)} · {picks.length} of 7 days picked</p></div>
    </div>
    <ol className="review-list">
      {days.map((day, index) => {
        const option = plan.slots[index + 1];
        return <li key={day}>
          <div className="review-day"><strong>{day}</strong>{index > 4 && <span>Friday delivery</span>}</div>
          {option ? <>
            <div className="review-meals">
              {option.dishes.map(dish => <div key={dish.id}><span className="meal-code">{dish.code}</span><span lang="hu">{dish.name}</span></div>)}
            </div>
            <div className="review-numbers"><strong>{calories(option.kcal)}</strong><span>{money(option.price)}</span></div>
          </> : <span className="skipped-label">Skipped</span>}
        </li>;
      })}
    </ol>
    <div className="cart-footer">
      <div><span>Estimated total</span><strong>{money(total)}</strong></div>
      <button type="button" className="button primary" onClick={() => onCart(lines)} disabled={!lines.length}>
        <ShoppingBasket size={20} /> Add to Teletál cart
      </button>
    </div>
    <div className="review-links">
      <button type="button" className="text-button" onClick={copyChecklist} disabled={!lines.length}>Copy meal list</button>
      <button type="button" className="text-button" onClick={onNew}>Plan another week</button>
    </div>
  </main>;
}

function App() {
  const [plan, setPlan] = useState(savedPlan);
  const [setup, setSetup] = useState(() => !savedPlan());
  const [settings, setSettings] = useState(() => plan?.settings ?? newSettings);
  const [weeks, setWeeks] = useState([]);
  const [weekError, setWeekError] = useState('');
  const [weekAttempt, setWeekAttempt] = useState(0);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const canContinue = plan?.day <= 7 && ['week', 'calories', 'tolerance'].every(key => settings[key] === plan.settings[key]);

  useEffect(() => {
    if (!setup || weeks.length) return;
    const aborter = new AbortController();
    setWeekError('');
    loadJson('/api/weeks', aborter.signal).then(published => {
      if (!published.length) throw new Error('No delivery weeks are listed yet.');
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
    } catch {
      setNotice('Your browser could not save this plan locally.');
    }
  }, [plan]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  function start() {
    if (canContinue) {
      setPlan(current => ({ ...current, settings }));
      return setSetup(false);
    }
    if (plan && !window.confirm('Start a new plan and replace the saved picks?')) return;
    setPlan(startPlan({ ...settings }));
    setSetup(false);
  }

  return <>
    <header className="app-header">
      <div className="header-inner">
        <div className="brand"><span className="brand-icon"><Utensils size={20} /></span><span>{appName}</span></div>
        <div className="header-actions">
          {!setup && <button type="button" className="quiet-button" aria-label="Settings" onClick={() => {
            setSettings(plan.settings);
            setSetup(true);
          }}><SlidersHorizontal size={17} /><span>Settings</span></button>}
          <InstallButton onHelp={() => setModal({ type: 'install' })} />
        </div>
      </div>
    </header>
    {setup ? <main className="setup">
      <Setup settings={settings} setSettings={setSettings} weeks={weeks} weekError={weekError}
        onRetry={() => setWeekAttempt(value => value + 1)} onStart={start} onResume={() => setSetup(false)}
        hasPlan={Boolean(plan)} canContinue={canContinue} />
    </main> : plan?.day <= 7 ? <Picker plan={plan} updatePlan={setPlan} />
      : <Review plan={plan} onCart={lines => setModal({ type: 'cart', lines })} onNotice={setNotice}
        onNew={() => { setSettings({ ...plan.settings, week: defaultWeek(weeks) ?? plan.settings.week }); setSetup(true); }} />}
    {modal?.type === 'install' && <Modal name={`Install ${appName}`} onClose={() => setModal(null)}>
      <p><Smartphone size={19} className="inline-icon" /> On iPhone, open {appName} in Safari, tap Share, then choose <b>Add to Home Screen</b>.</p>
      <p>On Android, open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. On desktop, use your browser’s install option if available.</p>
    </Modal>}
    {modal?.type === 'cart' && <Modal name="Send picks to Teletál" onClose={() => setModal(null)}>
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
