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

export function sourceDay(day) {
  return Math.min(day, 5);
}

export function eligibleDays(week, now = new Date(), deliveryDays) {
  const monday = mondayOfWeek(week);
  if (!monday) return [];
  const earliest = addDays(todayInBudapest(now), 2);
  return [1, 2, 3, 4, 5, 6, 7].filter(day => {
    const deliveryDay = sourceDay(day);
    return addDays(monday, deliveryDay - 1) >= earliest && (!deliveryDays || deliveryDays.has(deliveryDay));
  });
}

export function upcomingWeeks(weeks, now = new Date()) {
  return weeks.filter(week => eligibleDays(week.key, now).length > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function defaultWeek(weeks, now = new Date()) {
  const next = isoWeek(addDays(todayInBudapest(now), 7));
  const upcoming = upcomingWeeks(weeks, now);
  return upcoming.find(week => week.key === next)?.key ?? upcoming[0]?.key ?? '';
}

const shortDate = new Intl.DateTimeFormat('hu-HU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('hu-HU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export function weekLabel(key) {
  const monday = mondayOfWeek(key);
  if (!monday) return '';
  return shortDate.formatRange(monday, addDays(monday, 6));
}

export function dayLabel(week, day) {
  return longDate.format(dateForSlot(week, day));
}
