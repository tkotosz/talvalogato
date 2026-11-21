import { useEffect, useState } from 'react';
import { SlidersHorizontal, Smartphone, Utensils } from 'lucide-react';
import { initialPlanner, plannerView, reducePlanner, type PlannerAction, type PlannerContext } from '../core/planner.ts';
import type { CatalogDish, PublishedWeek } from '../core/types.ts';
import { upcomingWeeks } from '../core/weeks.ts';
import { CartDialogContent } from './components/CartDialog.tsx';
import { InstallButton } from './components/InstallButton.tsx';
import { Modal } from './components/Modal.tsx';
import { PreferencesForm } from './components/PreferencesForm.tsx';
import { StepBar, StepProgress, type DayAction } from './components/Steps.tsx';
import { appName } from './format.ts';
import { loadJson, loadMenuCatalog } from './menu-client.ts';
import { MealsScreen } from './screens/MealsScreen.tsx';
import { OverviewScreen } from './screens/OverviewScreen.tsx';
import { StatusScreen } from './screens/StatusScreen.tsx';
import { WeekScreen } from './screens/WeekScreen.tsx';
import { loadSaved, save } from './storage.ts';
import { useLoad } from './useLoad.ts';

type Dialog = 'preferences' | 'resetPlan' | 'install' | 'cart';

export function App() {
  const [planner, setPlanner] = useState(() => {
    const saved = loadSaved();
    return initialPlanner(saved.plan, saved.preferences);
  });
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState('');

  const published = useLoad('weeks', signal => loadJson<PublishedWeek[]>('/api/weeks', signal));
  const publishedWeeks = published.state.phase === 'ready' ? published.state.value : [];
  const weeks = upcomingWeeks(publishedWeeks, calendarNow);
  const weekError =
    published.state.phase === 'error'
      ? published.state.message
      : published.state.phase === 'ready' && !publishedWeeks.length
        ? 'Még nincs közzétett heti étlap.'
        : publishedWeeks.length && !weeks.length
          ? 'Még nincs elérhető következő hét.'
          : '';

  // The catalog depends on the active week, which does not depend on the catalog.
  const week = plannerView(planner, { weeks, catalog: null, now: calendarNow }).week;
  const catalog = useLoad(week || null, signal => loadMenuCatalog(week, signal));
  const catalogItems: CatalogDish[] | null = catalog.state.phase === 'ready' ? catalog.state.value : null;
  const view = plannerView(planner, { weeks, catalog: catalogItems, now: calendarNow });
  const { step, preferences } = planner;
  const { day, eligible, availableDays, order } = view;
  const showPicker = step === 'meals' && day !== undefined && catalogItems !== null;
  const availabilityError = week ? (catalog.state.phase === 'error' ? catalog.state.message : '') : weekError;
  const closeDialog = () => setDialog(null);

  function dispatch(action: PlannerAction) {
    const now = new Date();
    const context: PlannerContext = { weeks: upcomingWeeks(publishedWeeks, now), catalog: catalogItems, now };
    setCalendarNow(now);
    setPlanner(current => reducePlanner(current, action, context));
  }

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
    // Saving syncs with localStorage, an external system; the notice reports when the browser refuses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!save(planner.plan, planner.preferences)) setNotice('A böngésző nem tudta menteni a változtatásokat.');
  }, [planner.plan, planner.preferences]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const pickerDay = step === 'meals' ? day : null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step, week, pickerDay]);

  const customStage = showPicker && !view.dayDone ? view.custom?.stage : undefined;
  const inCourseDeck = customStage !== undefined && customStage !== 'select' && customStage !== 'overview';
  const canReset = view.hasSavedProgress && planner.plan?.week === week;
  const dayAction: DayAction | null = !showPicker
    ? step !== 'meals' && canReset
      ? { label: 'Újrakezdés', onClick: () => setDialog('resetPlan') }
      : null
    : view.dayDone
      ? { label: 'Nap szerkesztése', onClick: () => dispatch({ type: 'openDay', day, edit: true }) }
      : inCourseDeck
        ? { label: 'Nem kérek', onClick: () => dispatch({ type: 'clearCourse', day }) }
        : { label: 'Nap kihagyása', onClick: () => dispatch({ type: 'decide', day, action: 'skip' }) };

  // The meal picker moves through the days in calendar order; inside a custom day, Vissza steps back through its steps.
  const { previousDay, nextDay } = view;
  const mealsNext =
    nextDay !== undefined
      ? { label: 'Következő nap', go: () => dispatch({ type: 'openDay', day: nextDay }) }
      : { label: 'Áttekintés', go: () => dispatch({ type: 'navigate', step: 'overview' }) };
  const mealsBack =
    customStage !== undefined
      ? { label: 'Vissza', go: backInCustomDay }
      : previousDay !== undefined
        ? { label: 'Előző nap', go: () => dispatch({ type: 'openDay', day: previousDay }) }
        : { label: 'Vissza', go: () => dispatch({ type: 'navigate', step: 'week' }) };

  function backInCustomDay() {
    if (inCourseDeck) return dispatch({ type: 'openStage', day: day!, stage: 'overview' });
    if (customStage === 'overview') return dispatch({ type: 'openStage', day: day!, stage: 'select' });
    dispatch({ type: 'leaveCustom', day: day! });
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">
              <Utensils size={20} />
            </span>
            <span>{appName}</span>
          </div>
          <div className="header-actions">
            <button type="button" className="quiet-button" aria-label="Beállítások" onClick={() => setDialog('preferences')}>
              <SlidersHorizontal size={17} />
              <span>Beállítások</span>
            </button>
            <InstallButton onHelp={() => setDialog('install')} />
          </div>
        </div>
      </header>
      <StepProgress step={step} onNavigate={target => dispatch({ type: 'navigate', step: target })} />
      {step === 'week' ? (
        <WeekScreen
          view={view}
          weeks={weeks}
          weekError={weekError}
          catalog={catalog.state}
          dispatch={dispatch}
          onRetryWeeks={published.retry}
          onRetryCatalog={catalog.retry}
        />
      ) : order ? (
        <OverviewScreen view={view} onNotice={setNotice} onViewDay={value => dispatch({ type: 'openDay', day: value })} />
      ) : showPicker ? (
        <MealsScreen
          key={week + ':' + day + ':' + view.editing}
          plan={view.plan}
          day={day}
          eligible={eligible}
          catalog={catalogItems}
          preferences={preferences}
          editing={view.editing}
          done={view.dayDone}
          custom={view.custom}
          dispatch={dispatch}
        />
      ) : (
        <StatusScreen
          step={step}
          week={week}
          error={availabilityError}
          loading={!availabilityError && catalog.state.phase !== 'ready'}
          noDaysSelected={availableDays.length > 0 && !eligible.length}
          onRetry={week ? catalog.retry : published.retry}
        />
      )}
      <StepBar
        nextLabel={
          step === 'week' ? (canReset ? 'Folytatás' : 'Válogatás indítása') : step === 'meals' ? mealsNext.label : undefined
        }
        step={step}
        dayAction={dayAction}
        backLabel={step === 'meals' ? mealsBack.label : undefined}
        onBack={() => (step === 'meals' ? mealsBack.go() : dispatch({ type: 'navigate', step: 'meals' }))}
        onNext={() =>
          step === 'overview'
            ? setDialog('cart')
            : step === 'meals'
              ? mealsNext.go()
              : dispatch({ type: 'navigate', step: 'overview' })
        }
        disabled={step === 'week' ? catalogItems === null || !eligible.length : step === 'overview' && !order?.lines.length}
      />
      {dialog === 'preferences' && (
        <Modal name="Beállítások" onClose={closeDialog} className="preferences-dialog">
          <PreferencesForm
            preferences={preferences}
            week={week}
            onSave={value => {
              dispatch({ type: 'savePreferences', preferences: value });
              closeDialog();
            }}
          />
        </Modal>
      )}
      {planner.pendingNewPlan && (
        <Modal name="Új heti tervet indítasz?" onClose={() => dispatch({ type: 'cancelNewPlan' })}>
          <p>Az új terv felülírja a mentett választásaidat.</p>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => dispatch({ type: 'cancelNewPlan' })}>
              Mégse
            </button>
            <button type="button" className="button primary" onClick={() => dispatch({ type: 'confirmNewPlan' })}>
              Új terv indítása
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'resetPlan' && (
        <Modal name="Újrakezded a heti válogatást?" onClose={closeDialog}>
          <p>A hét mentett választásai és válogatási előzményei törlődnek.</p>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={closeDialog}>
              Mégse
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                dispatch({ type: 'resetWeek' });
                closeDialog();
              }}
            >
              Újrakezdés
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'install' && (
        <Modal name={`A ${appName} telepítése`} onClose={closeDialog}>
          <p>
            <Smartphone size={19} className="inline-icon" /> iPhone-on nyisd meg az oldalt a Safariban, és a Megosztás menüben
            válaszd a <b>Hozzáadás a Főképernyőhöz</b> lehetőséget. Ha megjelenik, kapcsold be a <b>Megnyitás webappként</b>{' '}
            beállítást.
          </p>
          <p>
            Androidon a böngésző menüjében válaszd az <b>Alkalmazás telepítése</b> vagy a <b>Hozzáadás a kezdőképernyőhöz</b>{' '}
            lehetőséget. Számítógépen keresd a telepítési lehetőséget a böngésző menüjében.
          </p>
        </Modal>
      )}
      {dialog === 'cart' && (
        <Modal name="Ételek küldése a Teletál-kosárba" onClose={closeDialog}>
          <CartDialogContent plan={view.plan} preferences={preferences} onCatalog={catalog.replace} />
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
