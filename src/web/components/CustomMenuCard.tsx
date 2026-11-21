import { Flame } from 'lucide-react';
import { courseNames } from '../../core/courses.ts';
import type { MenuOption } from '../../core/types.ts';
import { calories, money } from '../format.ts';
import { MealPhotos } from './MealCard.tsx';

/** A saved custom day: its dishes by course, with the totals. */
export function CustomMenuCard({ option, target }: { option: MenuOption; target: number | null }) {
  const { dishes, kcal, price } = option;
  const overTarget = target !== null && kcal !== null && kcal > target;
  return (
    <article className="meal-card">
      <MealPhotos courses={dishes} coverPhoto={option.photo} />
      <div className="meal-content">
        <h2 lang="hu">Saját menü</h2>
        <ul className="course-list" aria-label="A menü fogásai">
          {dishes.map(dish => (
            <li key={dish.id}>
              <span lang="hu">
                <span className="course-label">{dish.course ? courseNames[dish.course] : ''}</span> {dish.name}
              </span>
              <span>{calories(dish.kcal)}</span>
            </li>
          ))}
        </ul>
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
