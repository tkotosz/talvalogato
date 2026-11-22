import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Flame } from 'lucide-react';
import { allergenList, optionAllergens } from '../../core/filters.ts';
import { dishCodePattern, normalizeGroupTitle, splitDishName } from '../../core/planning.ts';
import type { Allergen, Dish, MenuOption, WeekKey } from '../../core/types.ts';
import { calories, money } from '../format.ts';

const menuCoverage = new Map([
  ['Z10', '5 étkezés'],
  ['Z11', '4 étkezés a 8 órás étkezési időszakra'],
  ['IR', 'Ebéd és vacsora'],
  ['IRN', '6 étkezés, ebédtől másnap tízóraiig'],
]);
const coursePlaceholders: Record<string, string> = {
  soup: '/meal-placeholder-soup.webp',
  main: '/meal-placeholder-main.webp',
  third: '/meal-placeholder-third.webp',
};

interface PhotoCourse {
  name: string;
  kind?: string;
  photo?: string | null;
}

/** One photo per course: side by side for two courses, a gallery for more. */
export function MealPhotos({
  courses,
  coverPhoto,
  children,
}: {
  courses: PhotoCourse[];
  coverPhoto?: string | null;
  children?: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const count = courses.length;
  const gallery = count > 2;
  const current = Math.min(active, count - 1);
  const visibleCourses = gallery ? [courses[current]!] : courses;
  const changePhoto = (offset: number) => setActive((current + offset + count) % count);
  const keepCardStill = (event: React.PointerEvent) => event.stopPropagation();

  return (
    <div role={gallery ? 'group' : undefined} aria-label={gallery ? 'A fogások fotói' : undefined}>
      <div className={`meal-cover${count === 2 ? ' split-cover' : ''}`}>
        {visibleCourses.map((course, index) => {
          const photo = course.photo ?? (count === 1 ? coverPhoto : null);
          const showPhoto = photo && !failed.includes(photo);
          const placeholder = coursePlaceholders[course.kind ?? ''] ?? coursePlaceholders.third;
          return (
            <img
              key={gallery ? current : index}
              className={showPhoto ? undefined : 'course-placeholder'}
              src={showPhoto ? photo : placeholder}
              alt={showPhoto ? '' : `Illusztráció, a fogás fotója nem érhető el: ${course.name}`}
              draggable="false"
              onError={showPhoto ? () => setFailed(current => [...current, photo]) : undefined}
            />
          );
        })}
        {children}
        {gallery && (
          <div className="meal-gallery-controls">
            <button
              type="button"
              aria-label="Előző fogás fotója"
              onPointerDownCapture={keepCardStill}
              onClick={() => changePhoto(-1)}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <div className="meal-gallery-dots" aria-hidden="true">
              {courses.map((_, index) => (
                <span key={index} className={index === current ? 'active' : undefined} />
              ))}
            </div>
            <button
              type="button"
              aria-label="Következő fogás fotója"
              onPointerDownCapture={keepCardStill}
              onClick={() => changePhoto(1)}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {gallery && (
        <p className="meal-gallery-caption" role="status">
          <span>{courses[current]!.name}</span>
          <span>
            {current + 1}/{count}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The line of a dish on Teletál's weekly menu page, which has an anchor for every line, or null when the week, code or day
 * is not in its expected form.
 */
function teletalLineUrl(week: WeekKey, { code, day }: Pick<Dish, 'code' | 'day'>): string | null {
  const weekNumber = /^\d{4}-W(\d{2})$/.exec(week)?.[1];
  if (!weekNumber || !dishCodePattern.test(code) || !Number.isInteger(day) || day < 1 || day > 7) return null;
  return `https://www.teletal.hu/etlap/${Number(weekNumber)}#${code}_${Number(day)}`;
}

/** The allergens Teletál lists for a card's dishes, with a link to check them on Teletál where there is one. */
export function AllergenLine({ allergens, teletalUrl }: { allergens: Allergen[] | null; teletalUrl?: string | null }) {
  return (
    <p className="meal-allergens" lang="hu">
      <span>Allergének a Teletál szerint:</span>{' '}
      {allergens === null ? 'nincs adat' : allergens.length ? allergenList(allergens) : 'nincs feltüntetve'}
      {teletalUrl && (
        <>
          {' · '}
          {/* The card is dragged by the pointer; the link keeps it still. */}
          <a href={teletalUrl} target="_blank" rel="noreferrer" onPointerDownCapture={event => event.stopPropagation()}>
            Ellenőrzés a Teletálon <ExternalLink size={13} aria-hidden="true" />
          </a>
        </>
      )}
    </p>
  );
}

/**
 * A Teletál menu with its courses, or a single dish for a custom-day course, with calories, allergens and price.
 * `teletalWeek` adds a link to the line on Teletál; the demo leaves it out, because its dishes are invented.
 */
export function MealCard({
  option,
  target,
  teletalWeek = null,
}: {
  option: MenuOption;
  target: number | null;
  teletalWeek?: WeekKey | null;
}) {
  const { title, components = [], dishes, kcal, price } = option;
  const { code, menuName, category, section, course, note, diet, spicy } = dishes[0]!;
  // A single dish is named after itself; its Teletál group goes into a tag.
  const single = Boolean(course);
  // A single dish's title leaves out Teletál's parenthesized description, which gets its own line.
  const dishName = splitDishName(title);
  const name = single ? dishName.title : menuName;
  const heading = name === code ? code : `${code} ${name}`;
  const group = single ? (menuName !== title ? menuName : category) : category;
  const showGroup = group && group !== name;
  const coverage = menuCoverage.get(code);
  const listCourses = !single && components.length > 0;
  const marks = [diet === 'vegan' ? 'Vegán' : diet === 'vegetarian' ? 'Vegetáriánus' : null, spicy ? 'Csípős' : null].filter(
    mark => mark !== null,
  );
  return (
    <article className="meal-card">
      <MealPhotos courses={components.length ? components : dishes} coverPhoto={option.photo}>
        {(showGroup || marks.length > 0) && (
          <div className="meal-tags">
            {showGroup && <span className="meal-tag tag-group">{normalizeGroupTitle(group, section)}</span>}
            {marks.map(mark => (
              <span key={mark} className="meal-tag tag-mark">
                {mark}
              </span>
            ))}
          </div>
        )}
      </MealPhotos>
      <div className="meal-content">
        <h2 lang="hu">
          <span className="meal-code">{code}</span>
          {name !== code ? ` ${name}` : null}
        </h2>
        {coverage && <p className="meal-dish">{coverage}</p>}
        {single && dishName.description && (
          <p className="meal-dish" lang="hu">
            {dishName.description}
          </p>
        )}
        {note && (
          <p className="meal-dish meal-note" lang="hu">
            {note}
          </p>
        )}
        {!single && !components.length && title !== heading && (
          <p className="meal-dish" lang="hu">
            {title}
          </p>
        )}
        {listCourses && (
          <ul className="course-list" aria-label="A menü fogásai">
            {components.map((part, index) => (
              <li key={index}>
                <span lang="hu">{part.name}</span>
                <span>{calories(part.kcal)}</span>
              </li>
            ))}
          </ul>
        )}
        <AllergenLine
          allergens={optionAllergens(option)}
          teletalUrl={teletalWeek ? teletalLineUrl(teletalWeek, dishes[0]!) : null}
        />
        <div className="meal-meta">
          <span className={`calorie-badge${target !== null && kcal !== null && kcal > target ? ' over-target' : ''}`}>
            <Flame size={17} />
            {calories(kcal)}
          </span>
          <span>{money(price)}</span>
        </div>
      </div>
    </article>
  );
}
