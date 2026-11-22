import { Flame, Sparkles } from 'lucide-react';
import { groupedDishes } from '../../core/custom.ts';
import { optionAllergens } from '../../core/filters.ts';
import { menuCourseNames } from '../../core/planning.ts';
import type { MenuOption } from '../../core/types.ts';
import { calories, money } from '../format.ts';
import { AllergenLine, MealPhotos } from './MealCard.tsx';

/** How many portions a line orders, written before it when more than one, such as "2 × ". */
export function portionsPrefix(quantity: number): string {
  return quantity > 1 ? `${quantity} × ` : '';
}

/** The code a combined day goes by: its Teletál set menu's code, or SM for a menu built course by course. */
export function menuCode(option: MenuOption): string {
  return option.dishes.find(dish => !dish.course)?.code ?? 'SM';
}

/** A combined day, saved or generated: its dishes with their Teletál codes, and the totals. */
export function CustomMenuCard({
  option,
  target,
  generated = false,
}: {
  option: MenuOption;
  target: number | null;
  /** A menu the app put together and the user has not accepted yet. */
  generated?: boolean;
}) {
  const { kcal, price } = option;
  // Portions of the same dish are one line.
  const lines = groupedDishes(option.dishes);
  const overTarget = target !== null && kcal !== null && kcal > target;
  // A Teletál set menu shows one photo per course, like on its own card; a single dish shows its own photo.
  const photos = lines
    .map(line => line.dish)
    .flatMap((dish): { name: string; kind?: string; photo?: string | null }[] =>
      !dish.course && dish.components?.length ? dish.components : [dish],
    );
  return (
    <article className="meal-card">
      <MealPhotos courses={photos} coverPhoto={option.photo} />
      <div className="meal-content">
        <h2 lang="hu">
          {generated ? (
            <>
              <Sparkles size={22} className="idea-icon" aria-hidden="true" /> Ötlet a napodhoz
            </>
          ) : (
            <>
              <span className="meal-code">{menuCode(option)}</span> {option.title}
            </>
          )}
        </h2>
        <ul className="course-list" aria-label="A menü fogásai">
          {lines.map(({ dish, quantity }, index) => (
            <li key={index}>
              <span lang="hu" className="custom-dish">
                <span className="meal-code">{dish.code}</span>
                {dish.course ? (
                  <span>
                    {portionsPrefix(quantity)}
                    {dish.name}
                  </span>
                ) : (
                  // A Teletál set menu: its name, then its courses.
                  <span>
                    <span className="custom-dish-menu">
                      {portionsPrefix(quantity)}
                      {dish.menuName}
                    </span>
                    {menuCourseNames(dish).map(course => (
                      <span key={course} className="custom-dish-course">
                        {course}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span>{calories(Number.isFinite(dish.kcal) ? dish.kcal! * quantity : null)}</span>
            </li>
          ))}
        </ul>
        <AllergenLine allergens={optionAllergens(option)} />
        <div className="meal-meta">
          <span className={`calorie-badge${overTarget ? ' over-target' : ''}`}>
            <Flame size={17} />
            {calories(kcal)}
          </span>
          <span>{money(price)}</span>
        </div>
        {option.custom?.overLimit && <p className="over-limit-note">Kereten felül, engedélyezve</p>}
      </div>
    </article>
  );
}
