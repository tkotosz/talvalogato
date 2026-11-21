import { todayInBudapest } from '../core/weeks.ts';

export const appName = 'Tálválogató';
export const shortDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
/** Day names in the "on Monday" form, as in "Mit eszel hétfőn?". */
export const daysOn = ['hétfőn', 'kedden', 'szerdán', 'csütörtökön', 'pénteken', 'szombaton', 'vasárnap'];

export const number = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
export const money = (value: number) => `${number.format(value)}\u00a0Ft`;
export const calories = (value: number | null) =>
  Number.isFinite(value) ? `${number.format(value!)}\u00a0kcal` : 'Nincs kalóriaadat';

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

const budapestTime = new Intl.DateTimeFormat('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' });
const budapestDate = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', timeZone: 'Europe/Budapest' });

/** When something happened, in Budapest time: "ma 12:31", "tegnap 06:02" or "nov. 19. 06:02". */
export function sinceLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const days = Math.round((todayInBudapest(now).getTime() - todayInBudapest(at).getTime()) / 86_400_000);
  const day = days === 0 ? 'ma' : days === 1 ? 'tegnap' : budapestDate.format(at);
  return `${day} ${budapestTime.format(at)}`;
}
