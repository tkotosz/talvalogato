import { Flame, Sparkles } from 'lucide-react';
import { optionAllergens } from '../../core/filters.ts';
import type { Dish, MenuOption } from '../../core/types.ts';
import { calories, money } from '../format.ts';
import { AllergenLine, MealPhotos } from './MealCard.tsx';

/** The courses of a Teletál set menu, by the names its detail page gives them or as its name lists them. */
function setMenuCourses(dish: Dish): string[] {
  return dish.components?.length ? dish.components.map(course => course.name) : dish.name.split(' / ');
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
  const { dishes, kcal, price } = option;
  const overTarget = target !== null && kcal !== null && kcal > target;
  // A Teletál set menu shows one photo per course, like on its own card; a single dish shows its own photo.
  const photos = dishes.flatMap((dish): { name: string; kind?: string; photo?: string | null }[] =>
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
          {dishes.map(dish => (
            <li key={dish.id}>
              <span lang="hu" className="custom-dish">
                <span className="meal-code">{dish.code}</span>
                {dish.course ? (
                  <span>{dish.name}</span>
                ) : (
                  // A Teletál set menu: its name, then its courses.
                  <span>
                    <span className="custom-dish-menu">{dish.menuName}</span>
                    {setMenuCourses(dish).map(course => (
                      <span key={course} className="custom-dish-course">
                        {course}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span>{calories(dish.kcal)}</span>
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
