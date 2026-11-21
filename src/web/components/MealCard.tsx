import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { normalizeGroupTitle, splitDishName } from '../../core/planning.ts';
import type { MenuOption } from '../../core/types.ts';
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

/** A Teletál menu with its courses, or a single dish for a custom-day course, with calories and price. */
export function MealCard({ option, target }: { option: MenuOption; target: number | null }) {
  const { title, components = [], dishes, kcal, price } = option;
  const { code, menuName, category, section, course, note } = dishes[0]!;
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
  return (
    <article className="meal-card">
      <MealPhotos courses={components.length ? components : dishes} coverPhoto={option.photo}>
        {showGroup && (
          <div className="meal-tags">
            <span className="meal-tag tag-group">{normalizeGroupTitle(group, section)}</span>
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
