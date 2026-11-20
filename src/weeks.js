const dayMs = 86_400_000;
export const weekKeyPattern = /^(20\d{2})-W(0[1-9]|[1-4]\d|5[0-3])$/;
const budapest = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function todayInBudapest(now = new Date()) {
  const parts = Object.fromEntries(budapest.formatToParts(now).map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

export function isoWeek(date) {
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3 - (thursday.getUTCDay() + 6) % 7);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / dayMs + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * dayMs);
}

export function mondayOfWeek(key) {
  const [, year, week] = weekKeyPattern.exec(key) ?? [];
  if (!year) return null;
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const monday = addDays(jan4, -(jan4.getUTCDay() + 6) % 7 + (Number(week) - 1) * 7);
  return isoWeek(monday) === key ? monday : null;
}

export function dateForSlot(week, day) {
  return addDays(mondayOfWeek(week), day - 1);
}

export function defaultWeek(weeks, now = new Date()) {
  const next = isoWeek(addDays(todayInBudapest(now), 7));
  return weeks.find(week => week.key >= next)?.key ?? weeks.at(-1)?.key;
}

const monthDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
});

export function weekLabel(key) {
  const monday = mondayOfWeek(key);
  if (!monday) return '';
  return `${monthDay.format(monday)}–${monthDay.format(addDays(monday, 6))}`;
}

export function dayLabel(week, day) {
  return weekdayDate.format(dateForSlot(week, day));
}
