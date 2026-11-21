import { restorePlans, restorePreferences, type PreferenceInput } from '../core/planning.ts';
import type { Plan, Preferences, WeekKey } from '../core/types.ts';

const plansKey = 'talvalogato.plans.v3';
/** The single plan saved before plans were kept per week; read once to carry it over. */
const previousPlanKey = 'talvalogato.plan.v2';
const preferencesKey = 'talvalogato.preferences.v1';

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

export function loadSaved(): { plans: Record<WeekKey, Plan>; preferences: Preferences } {
  return {
    plans: restorePlans(read(plansKey), read(previousPlanKey)),
    preferences: restorePreferences(read(preferencesKey) as PreferenceInput | null),
  };
}

/** Saves the plans and preferences; returns false when the browser refuses. */
export function save(plans: Record<WeekKey, Plan>, preferences: Preferences): boolean {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
    localStorage.setItem(plansKey, JSON.stringify(plans));
    localStorage.removeItem(previousPlanKey);
    return true;
  } catch {
    return false;
  }
}
