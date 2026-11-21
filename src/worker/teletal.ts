import { load, type Cheerio, type CheerioAPI } from 'cheerio/slim';
import type { AnyNode } from 'domhandler';
import { dishCodePattern, normalizeGroupTitle } from '../core/planning.ts';
import type { CatalogDish, Course, CourseKind, DishDetails, DishKind, PublishedWeek, WeekKey } from '../core/types.ts';
import { isoWeek, mondayOfWeek, todayInBudapest } from '../core/weeks.ts';

export const teletal = 'https://www.teletal.hu';
const detailSelector = 'a[kod][nap].menu-info-button, a[kod][nap].minib, a[kod][nap].mib';
const sectionsOutsidePicker = /^(reggeli|zzabkasa|savanyusag|diacipo|dianasi|xixo|hell|ital|vitamin|frissit)/;
const sectionTitlePattern = /^\p{Lu}[\p{Ll}\p{M}]+(?:[ -]\p{Lu}?[\p{Ll}\p{M}]+)*$/u;
const vegaGroupName = 'Vega & vegán';
// Teletál renders these grid headings as CSS background images.
const imageMenuNames = new Map([
  ['Z10', 'Full Day menü'],
  ['Z11', '8/16 időszakos böjt menü'],
  ['IR', 'Inzulinrezisztens menü (85 g CH/nap)'],
  ['IRN', 'Inzulinrezisztens menü (160 g CH/nap)'],
  ['V1', vegaGroupName],
  ['V2', vegaGroupName],
  ['V3', vegaGroupName],
  ['szejtan', vegaGroupName],
]);
const courseKinds = new Map<string, CourseKind>([
  ['leves', 'soup'], ['foetel', 'main'], ['desszert', 'dessert'], ['sutemeny', 'dessert'], ['joghurt', 'dessert'],
  ['savanyusag', 'side'], ['koret', 'side'],
]);
const cleanText = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const plain = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

interface SectionHeading {
  category: string;
  groupId: string;
  cuisine: string | null;
  pickerEligible: boolean;
}

interface FetchOptions {
  ajax?: boolean;
  cookie?: string;
  referer?: string;
  params?: Record<string, string | number>;
}

async function fetchHtml(path: string, { ajax = false, cookie, referer, params }: FetchOptions = {}) {
  const url = new URL(path, teletal);
  if (params) {
    // Teletál expects percent-encoded spaces in section names.
    url.search = Object.entries(params).map(([key, value]) =>
      encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
  }
  const headers: Record<string, string> = { 'Accept-Language': 'hu-HU,hu;q=0.9' };
  if (ajax) headers['X-Requested-With'] = 'XMLHttpRequest';
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(9_000) });
  if (!response.ok) throw new Error(`Teletál returned HTTP ${response.status}`);
  return { $: load(await response.text()), response };
}

function pendingPool<Item, Result>(items: Item[], width: number, task: (item: Item) => Promise<Result>): Promise<Result[]> {
  const values = new Array<Result>(items.length);
  let cursor = 0;
  return Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      values[index] = await task(items[index]!);
    }
  })).then(() => values);
}

function classify(section: string, title: string, code: string, menuName: string): DishKind {
  const key = plain(section);
  const name = plain(title);
  if (/^(menu|vakacio|z10|z11|z12|irn?$)/.test(key)
    || /^ZR7$|^SU\d$|^Z1[012]$/.test(code) || /\bmenu\b/.test(plain(menuName))) return 'menu';
  if (key.startsWith('desszert') || code === 'ZR8' || code === 'Z9') return 'dessert';
  if (key === 'leves' || key === 'v1' || name.includes('leves')) return 'soup';
  return 'main';
}

function readMenuName(card: Cheerio<AnyNode>): string | null {
  const heading = card.closest('tr').children('.menu-cell-code-sub2').find('h2').first().clone();
  const schoolMenu = heading.find('img[src]').first().attr('src')?.match(/(?:^|\/)sulido(\d+)(?=[_.-]|$)/i)?.[1];
  if (schoolMenu) return `Sulidő ${schoolMenu}`;

  heading.find('br').replaceWith('|');
  const lines = heading.text().split('|').map(cleanText);
  const priceLine = lines.findIndex(line => /^\d[\d.,\s]*\s*Ft\b/i.test(line));
  const label = lines.slice(0, priceLine < 0 ? undefined : priceLine).filter(Boolean).join(' ');
  if (!label) return null;
  return label === label.toLocaleUpperCase('hu')
    ? label.toLocaleLowerCase('hu').replace(/(^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase('hu'))
    : label;
}

function itemsFrom($: CheerioAPI, section: string, headings: Map<string, SectionHeading>): CatalogDish[] {
  const { category, groupId, cuisine, pickerEligible } = headings.get(section)!;
  return $(detailSelector).toArray().flatMap(entry => {
    const anchor = $(entry);
    const day = Number(anchor.attr('nap'));
    const code = anchor.attr('kod')?.toUpperCase() ?? '';
    const type = Number(anchor.attr('tipus') ?? 1);
    if (!Number.isInteger(day) || day < 1 || day > 7 || !dishCodePattern.test(code) || !Number.isInteger(type)) return [];

    const card = anchor.closest('.menu-card, .mc');
    const input = card.find('input[ar]').first();
    const price = Number(input.attr('ar')?.replace(',', '.'));
    if (!input.length || input.is('[disabled]') || !Number.isFinite(price) || price <= 0) return [];

    const titleNodes = card.find('.menu-cell-text-row.uk-text-break, .menu-cell-text-row.uk-text-small, .menu-item-title').first().clone();
    titleNodes.find('br').replaceWith(' / ');
    const name = cleanText(titleNodes.text()).replace(/,\s*\/\s*/g, ' / ').replace(/\s*\/\s*$/, '') || category;
    const menuName = readMenuName(card) ?? imageMenuNames.get(code) ?? category;
    const kind = classify(section, name, code, menuName);
    const weekend = card.find('img[title]').toArray().some(img => plain($(img).attr('title') ?? '').includes('szombat'));
    return [{ id: `${day}:${type}:${code}`, day, type, code, kind, name, price,
      section, groupId, category: menuName.startsWith('Sulidő ') ? 'Sulidő' : category, cuisine, menuName, weekend, pickerEligible }];
  });
}

function distinguishGroupTitles(catalog: CatalogDish[]): CatalogDish[] {
  const groupsByTitle = new Map<string, Map<string, string>>();
  for (const { groupId, section, category } of catalog) {
    const groups = groupsByTitle.get(category) ?? new Map<string, string>();
    groups.set(groupId, section);
    groupsByTitle.set(category, groups);
  }

  const replacements = new Map<string, string>();
  const usedTitles = new Set(groupsByTitle.keys());
  for (const [title, sections] of groupsByTitle) {
    if (sections.size < 2 || [...sections.values()].some(section => !sectionTitlePattern.test(section))) continue;
    const proposed = [...sections].map(([groupId, section]) => [groupId, normalizeGroupTitle(section.toLocaleUpperCase('hu'), section)] as const);
    const labels = new Set(proposed.map(([, label]) => label));
    if (labels.size !== sections.size || [...labels].some(label => label !== title && usedTitles.has(label))) continue;
    for (const [groupId, label] of proposed) {
      replacements.set(groupId, label);
      usedTitles.add(label);
    }
  }

  return catalog.map(dish => {
    const category = replacements.get(dish.groupId) ?? dish.category;
    return category === dish.category ? dish : { ...dish, category };
  });
}

export async function publishedWeeks(): Promise<PublishedWeek[]> {
  const { $ } = await fetchHtml('/etlap');
  const form = $('#etlap_form');
  const current = Number(form.attr('het'));
  const year = Number(form.attr('ev'));
  if (!current || !year) throw new Error('The current Teletál week was missing');
  const reference = mondayOfWeek(`${year}-W${String(current).padStart(2, '0')}`) ?? todayInBudapest();
  const possibleWeeks = new Map<number, WeekKey>();
  for (let delta = -5; delta <= 10; delta++) {
    const key = isoWeek(new Date(reference.getTime() + delta * 604_800_000));
    possibleWeeks.set(Number(key.slice(-2)), key);
  }
  const links = $('a[href^="/etlap/"]').toArray().flatMap(node => {
    const match = $(node).attr('href')?.match(/^\/etlap\/(\d{1,2})\/?$/);
    const key = match && possibleWeeks.get(Number(match[1]));
    return key ? [key] : [];
  });
  return [...new Set(links)].sort().map(key => ({ key }));
}

export async function menuCatalog(key: WeekKey): Promise<CatalogDish[]> {
  const [year = '', weekWithZero] = key.split('-W');
  const week = String(Number(weekWithZero));
  const path = `/etlap/${week}`;
  const { $, response } = await fetchHtml(path);
  const form = $('#etlap_form');
  if (form.attr('ev') !== year || Number(form.attr('het')) !== Number(week)) {
    throw new Error('Teletál has not published this week');
  }
  const cookie = response.headers.get('set-cookie')?.match(/PHPSESSID=[^;,\s]+/i)?.[0];
  const sections = form.find('section[section]').toArray();
  if (!sections.length) throw new Error('The Teletál menu sections were missing');
  const headings = new Map(sections.map(node => {
    const section = $(node);
    const name = section.attr('section') ?? '';
    const heading = section.find('h2, .title-xixo').first();
    const text = cleanText(name === 'Zero' ? heading.find('strong').first().text() : heading.text());
    const [title = '', ...subtitles] = text.split('|').map(part => part.trim());
    const category = name === 'Vakáció' ? 'Vakáció menü'
      : normalizeGroupTitle(title, name) || imageMenuNames.get(name) || name;
    return [name, {
      category,
      groupId: category === vegaGroupName ? vegaGroupName : name,
      cuisine: subtitles.find(subtitle => /\bkonyha$/iu.test(subtitle)) ?? null,
      pickerEligible: !sectionsOutsidePicker.test(plain(name)),
    }];
  }));
  const groups = await pendingPool(sections, 4, async node => {
    const section = $(node);
    const name = section.attr('section') ?? '';
    if (!section.find('.dummy').length) {
      const scope = load(section.html() ?? '');
      return itemsFrom(scope, name, headings);
    }
    const { $: fragment } = await fetchHtml('/ajax/szekcio', {
      ajax: true, cookie, referer: response.url,
      params: { ev: year, het: week, ewid: section.attr('ewid') ?? '', varname: name },
    });
    if (!fragment('tr, .menu-card, .mc').length) throw new Error(`Could not read Teletál’s ${name} section`);
    return itemsFrom(fragment, name, headings);
  });

  const catalog = groups.flatMap(items => [...new Map(items.map(dish => [dish.id, dish])).values()]);
  return distinguishGroupTitles(catalog);
}

function photoUrl(image: Cheerio<AnyNode>): string | null {
  const entries = image.attr('srcset')?.split(',').map(value => value.trim().split(/\s+/)) ?? [];
  const source = entries.find(([, width]) => width === '640w')?.[0] ?? entries[0]?.[0] ?? image.attr('src');
  if (!source) return null;
  try {
    const url = new URL(source, teletal);
    return url.origin === teletal && url.pathname.startsWith('/etel_kepek/') ? url.href : null;
  } catch {
    return null;
  }
}

function readComponents($: CheerioAPI): Course[] {
  const headings = $('h1.uk-article-title:not(.uk-background-secondary)').toArray();
  const servings = $('.en_adag').toArray()
    .map(element => cleanText($(element).text()))
    .filter(value => /kcal/i.test(value));
  if (!servings.length || headings.length !== servings.length) return [];
  return servings.map((value, index) => {
    const heading = $(headings[index]);
    const label = plain(cleanText(heading.prevAll('h2').first().text())).match(/\(\d+\)\s+(.+)$/)?.[1];
    const course = heading.nextUntil('h1, h2');
    const images = course.filter('img').add(course.find('img'));
    const photo = images.toArray().map(image => photoUrl($(image))).find(Boolean) ?? null;
    return {
      name: cleanText(heading.text()),
      kcal: Number(value.replace(/kcal\s*$/i, '').trim().replaceAll(',', '') || NaN),
      kind: label === undefined ? undefined : courseKinds.get(label),
      photo,
    };
  }).filter(component => Number.isFinite(component.kcal) && component.kcal >= 0);
}

export async function nutritionFor(key: WeekKey, ids: string[]): Promise<DishDetails[]> {
  const [year = '', week] = key.split('-W');
  return pendingPool(ids, 4, async (id): Promise<DishDetails> => {
    const [day = '', type = '', code = ''] = id.split(':');
    try {
      const { $ } = await fetchHtml('/ajax/kodinfo', {
        ajax: true, params: { ev: year, het: Number(week), tipus: type, nap: day, kod: code },
      });
      const components = readComponents($);
      const complete = components.length && components.length === $('h1.uk-article-title:not(.uk-background-secondary)').length;
      if (!complete) return { id, kcal: null };
      const total = Math.round(components.reduce((sum, course) => sum + course.kcal, 0) * 10) / 10;
      return {
        id, kcal: total,
        components, photo: components.find(course => course.photo)?.photo ?? null,
      };
    } catch {
      return { id, kcal: null, retryable: true };
    }
  });
}
