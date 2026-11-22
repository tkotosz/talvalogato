import { ChevronRight, ClipboardList, Copy } from 'lucide-react';
import type { PlannerView } from '../../core/planner.ts';
import { days, type OrderSummary } from '../../core/planning.ts';
import type { Day, MenuOption, Preferences } from '../../core/types.ts';
import { menuCode } from '../components/CustomMenuCard.tsx';
import { AllergenReminder } from '../components/FilterNotes.tsx';
import { shortDayLabel, weekLabel } from '../../core/weeks.ts';
import { appName, calories, copyText, money } from '../format.ts';

/** A menu in the overview: a title row with its code, then one row per item, all aligned on one grid. */
function MenuItems({
  code,
  title,
  items,
}: {
  code: string;
  title: string;
  items: { key: string; code?: string; text: string }[];
}) {
  return (
    <span className="review-items" lang="hu">
      <span className="meal-code">{code}</span>
      <span className="review-menu-title">{title}</span>
      {items.map(item => (
        <span key={item.key} className="review-item">
          <span>{item.code && <span className="meal-code">{item.code}</span>}</span>
          <span>{item.text}</span>
        </span>
      ))}
    </span>
  );
}

/** A custom day: its dishes with their Teletál codes. */
function CustomItems({ option }: { option: MenuOption }) {
  // A Teletál set menu among the dishes is named, with its courses after it.
  const items = option.dishes.map(dish => ({
    key: dish.id,
    code: dish.code,
    text: dish.course ? dish.name : `${dish.menuName}: ${dish.name}`,
  }));
  return <MenuItems code={menuCode(option)} title={option.title} items={items} />;
}

/** A Teletál set menu: its code and name, then its courses, each under the menu's code. */
function SetMenuItems({ option }: { option: MenuOption }) {
  const [dish] = option.dishes;
  if (!dish) return null;
  const name = dish.menuName || dish.name;
  const courses = (option.components?.length ? option.components.map(course => course.name) : [dish.name]).filter(
    course => course && course !== name,
  );
  return (
    <MenuItems
      code={dish.code}
      title={name}
      items={courses.map((text, index) => ({ key: String(index), code: dish.code, text }))}
    />
  );
}

/** Step 3: the week's decisions and what will reach the cart. */
export function OverviewScreen({
  view,
  preferences,
  onNotice,
  onViewDay,
}: {
  view: PlannerView;
  preferences: Preferences;
  onNotice(message: string): void;
  onViewDay(day: Day): void;
}) {
  const { plan, reviewDays, eligible, order } = view;
  const { issues, total, kcal }: Omit<OrderSummary, 'lines'> = order ?? { issues: {}, total: 0, kcal: 0 };
  const summary = reviewDays.map(day => {
    const available = eligible.includes(day);
    const option = plan.slots[day];
    const status = !available ? 'Nem rendelhető' : option === null ? 'Kihagyva' : 'Nincs választás';
    return { day, label: days[day - 1]!, available, option, status, issue: issues[day] };
  });
  const picks = summary.filter(({ option }) => option);
  const hasIssues = Object.keys(issues).length > 0;

  async function copyChecklist() {
    const checklist = [
      appName + ' · ' + weekLabel(plan.week),
      ...summary.map(({ day, label, option, status, issue }) => {
        if (!option) return label + ' – ' + status;
        const dishes =
          (option.kind === 'custom' ? option.title + ': ' : '') +
          option.dishes.map(dish => dish.code + ' ' + dish.name).join(' + ');
        return (
          label +
          (day > 5 ? ' (pénteki kiszállítás)' : '') +
          ' – ' +
          dishes +
          ' · ' +
          calories(option.kcal) +
          (issue ? ' · ' + issue : '')
        );
      }),
    ].join('\n');
    onNotice(
      (await copyText(checklist))
        ? 'Étellista a vágólapra másolva'
        : 'A vágólap nem érhető el. Jelöld ki az étellistát ezen az oldalon.',
    );
  }

  return (
    <main className="review">
      <div className="review-heading">
        <span className="section-icon">
          <ClipboardList size={23} aria-hidden="true" />
        </span>
        <div>
          <h1>Heti választásaid</h1>
          <p>
            {weekLabel(plan.week)} · {picks.length} napra választottál ételt
          </p>
        </div>
        <button
          type="button"
          className="quiet-button review-copy"
          onClick={copyChecklist}
          disabled={!picks.length}
          aria-label="Étellista másolása vágólapra"
          title="Étellista másolása vágólapra"
        >
          <Copy size={17} aria-hidden="true" />
          <span>Étellista másolása vágólapra</span>
        </button>
      </div>
      <AllergenReminder preferences={preferences} />
      <ol className="review-list">
        {summary.map(({ day, label, available, option, status, issue }) => {
          const contents = (
            <>
              <span className="review-day">
                <strong>{label}</strong>
                <span className="review-date">{shortDayLabel(plan.week, day)}</span>
                {day > 5 && <span className="review-tag">Pénteki kiszállítás</span>}
              </span>
              {option ? (
                <span className="review-numbers">
                  <strong>{calories(option.kcal)}</strong> · {money(option.price)}
                </span>
              ) : (
                <span className="review-status">{status}</span>
              )}
              {option && (
                <span className="review-menu">
                  {option.kind === 'custom' ? <CustomItems option={option} /> : <SetMenuItems option={option} />}
                  {option.custom?.overLimit && <span className="over-limit-note">Kereten felül, engedélyezve</span>}
                  {issue && <span className="selection-issue">{issue}</span>}
                </span>
              )}
            </>
          );
          return (
            <li key={day}>
              {available ? (
                <button type="button" className={option ? 'review-row' : 'review-row empty'} onClick={() => onViewDay(day)}>
                  {contents}
                  <ChevronRight className="review-open" size={16} aria-hidden="true" />
                </button>
              ) : (
                <div className={option ? 'review-row unavailable' : 'review-row empty unavailable'}>{contents}</div>
              )}
            </li>
          );
        })}
      </ol>
      {hasIssues && (
        <p className="review-note">A megjelölt választások figyelmet igényelnek. A kosárba a többi választható tétel kerül.</p>
      )}
      <div className="review-total">
        <span>{hasIssues ? 'Küldhető tételek összege' : 'Becsült összeg'}</span>
        <strong>
          {kcal === null ? 'ismeretlen kcal' : calories(kcal)} · {money(total)}
        </strong>
      </div>
    </main>
  );
}
