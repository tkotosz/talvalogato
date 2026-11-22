import type { Day, PublishedWeek, WeekKey } from './types.ts';

const dayMs = 86_400_000;
export const weekKeyPattern = /^(20\d{2})-W(0[1-9]|[1-4]\d|5[0-3])$/;
const budapest = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Budapest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInBudapest(now = new Date()): Date {
  const parts = Object.fromEntries(budapest.formatToParts(now).map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

export function isoWeek(date: Date): WeekKey {
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / dayMs + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs);
}

export function mondayOfWeek(key: string): Date | null {
  const [, year, week] = weekKeyPattern.exec(key) ?? [];
  if (!year) return null;
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const monday = addDays(jan4, (-(jan4.getUTCDay() + 6) % 7) + (Number(week) - 1) * 7);
  return isoWeek(monday) === key ? monday : null;
}

/** The date of a day in a valid week. */
export function dateForSlot(week: WeekKey, day: Day): Date {
  const monday = mondayOfWeek(week);
  if (!monday) throw new RangeError(`Invalid week ${week}`);
  return addDays(monday, day - 1);
}

/** Teletál delivers on weekdays, so weekend meals arrive with Friday's delivery. */
export function sourceDay(day: Day): Day {
  return Math.min(day, 5);
}

export function eligibleDays(week: WeekKey, now = new Date(), deliveryDays?: Set<Day>): Day[] {
  const monday = mondayOfWeek(week);
  if (!monday) return [];
  const earliest = addDays(todayInBudapest(now), 2);
  return [1, 2, 3, 4, 5, 6, 7].filter(day => {
    const deliveryDay = sourceDay(day);
    return addDays(monday, deliveryDay - 1) >= earliest && (!deliveryDays || deliveryDays.has(deliveryDay));
  });
}

export function upcomingWeeks(weeks: PublishedWeek[], now = new Date()): PublishedWeek[] {
  return weeks.filter(week => eligibleDays(week.key, now).length > 0).sort((a, b) => a.key.localeCompare(b.key));
}

export function defaultWeek(weeks: PublishedWeek[], now = new Date()): WeekKey {
  const next = isoWeek(addDays(todayInBudapest(now), 7));
  const upcoming = upcomingWeeks(weeks, now);
  return upcoming.find(week => week.key === next)?.key ?? upcoming[0]?.key ?? '';
}

const shortDate = new Intl.DateTimeFormat('hu-HU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('hu-HU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The week as the week selector and the overview show it: its number and dates, such as "48. hét (november 23–29.)", or with short month names,
 * such as "48. hét (nov. 23–29.)". The week number identifies the year, so a week spanning New Year leaves it out.
 */
export function weekOptionLabel(key: WeekKey, months: 'long' | 'short'): string {
  const monday = mondayOfWeek(key);
  if (!monday) return '';
  const sunday = addDays(monday, 6);
  const format = months === 'long' ? longDate : shortDate;
  const dates =
    monday.getUTCFullYear() === sunday.getUTCFullYear()
      ? format.formatRange(monday, sunday)
      : `${format.format(monday)} – ${format.format(sunday)}`;
  return `${Number(key.slice(-2))}. hét (${dates})`;
}

/** The day's date in short form, such as "nov. 25." */
export function shortDayLabel(week: WeekKey, day: Day): string {
  return shortDate.format(dateForSlot(week, day));
}

export function dayLabel(week: WeekKey, day: Day): string {
  return longDate.format(dateForSlot(week, day));
}
