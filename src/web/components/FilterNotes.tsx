import { SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { activeFilters, allergenList } from '../../core/filters.ts';
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

/** While the allergen filter is on: which allergens it leaves out, and that they must be checked on Teletál before ordering. */
export function AllergenReminder({ preferences }: { preferences: Preferences }) {
  if (!preferences.filterAllergens || !preferences.excludedAllergens.length) return null;
  return (
    <p className="info-note allergen-reminder" role="note">
      <TriangleAlert size={18} aria-hidden="true" />
      <span>
        <b>Allergénszűrő: {allergenList(preferences.excludedAllergens)}.</b> A szűrő a Teletál oldaláról automatikusan átvett
        adatokon alapul, ezek hibásak vagy hiányosak lehetnek. Rendelés előtt ellenőrizd az ételek allergénjeit a Teletál oldalán.
      </span>
    </p>
  );
}
