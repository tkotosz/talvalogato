import { SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { activeFilters } from '../../core/filters.ts';
import type { Preferences } from '../../core/types.ts';

/** For an empty deck: which settings leave dishes out, and a way to change them. Nothing without active filters. */
export function ActiveFilters({ preferences, onOpenSettings }: { preferences: Preferences; onOpenSettings(): void }) {
  const filters = activeFilters(preferences);
  if (!filters.length) return null;
  return (
    <>
      <p className="active-filters">Bekapcsolt szűrők: {filters.join('; ')}.</p>
      <button type="button" className="button secondary" onClick={onOpenSettings}>
        <SlidersHorizontal size={17} aria-hidden="true" /> Beállítások
      </button>
    </>
  );
}

/** Before ordering: the allergens and prices must be checked on Teletál, because they are copied from its pages. */
export function OrderReminder() {
  return (
    <p className="info-note order-reminder" role="note">
      <TriangleAlert size={18} aria-hidden="true" />
      <span>
        <b>Figyelmeztetés:</b> a Teletál adatait nem valós időben szerezzük be, ezért elavultak, hibásak vagy hiányosak lehetnek.
        Rendelés előtt ellenőrizd az ételek allergénjeit és árait a Teletál oldalán.
      </span>
    </p>
  );
}
