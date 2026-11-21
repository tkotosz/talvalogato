import { restorePlan, restorePreferences, type PreferenceInput, type StoredPlan } from '../core/planning.ts';
import type { Plan, Preferences } from '../core/types.ts';
import { mondayOfWeek } from '../core/weeks.ts';

const planKey = 'talvalogato.plan.v2';
const preferencesKey = 'talvalogato.preferences.v1';

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

export function loadSaved(): { plan: Plan | null; preferences: Preferences } {
  const saved = read(planKey) as Partial<StoredPlan> | null;
  const plan = saved?.id && saved.week && mondayOfWeek(saved.week) ? restorePlan(saved as StoredPlan) : null;
  return { plan, preferences: restorePreferences(read(preferencesKey) as PreferenceInput | null) };
}

/** Saves the plan and preferences; returns false when the browser refuses. */
export function save(plan: Plan | null, preferences: Preferences): boolean {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
    if (plan) localStorage.setItem(planKey, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}
