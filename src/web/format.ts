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
