import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { normalizeGroupTitle } from '../../core/planning.ts';
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
function MealPhotos({
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

/** A Teletál menu with its courses, calories and price. `target` is the calorie limit, if any. */
export function MealCard({ option, target }: { option: MenuOption; target: number | null }) {
  const { title, components = [], dishes, kcal, price } = option;
  const { code, menuName, category, section } = dishes[0]!;
  const heading = menuName === code ? code : `${code} ${menuName}`;
  const showGroup = category && category !== menuName;
  const coverage = menuCoverage.get(code);
  return (
    <article className="meal-card">
      <MealPhotos courses={components.length ? components : dishes} coverPhoto={option.photo}>
        {showGroup && (
          <div className="meal-tags">
            <span className="meal-tag tag-group">{normalizeGroupTitle(category, section)}</span>
          </div>
        )}
      </MealPhotos>
      <div className="meal-content">
        <h2 lang="hu">
          <span className="meal-code">{code}</span>
          {menuName !== code ? ` ${menuName}` : null}
        </h2>
        {coverage && <p className="meal-dish">{coverage}</p>}
        {!components.length && title !== heading && (
          <p className="meal-dish" lang="hu">
            {title}
          </p>
        )}
        {components.length > 0 && (
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
