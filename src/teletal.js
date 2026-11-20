import { load } from 'cheerio/slim';
import { dishCodePattern } from './planning.js';
import { isoWeek, mondayOfWeek, todayInBudapest } from './weeks.js';

export const teletal = 'https://www.teletal.hu';
const detailSelector = 'a[kod][nap].menu-info-button, a[kod][nap].minib, a[kod][nap].mib';
const sectionSizes = new Intl.Collator('hu', { sensitivity: 'base' });
const skippedSections = /^(reggeli|zzabkasa|savanyusag|diacipo|dianasi|xixo|hell|ital|vitamin|frissit)/;
const courseKinds = new Map([
  ['leves', 'soup'], ['foetel', 'main'], ['desszert', 'dessert'], ['sutemeny', 'dessert'], ['joghurt', 'dessert'],
  ['savanyusag', 'side'], ['koret', 'side'],
]);
const cleanText = value => value?.replace(/\s+/g, ' ').trim() ?? '';
const plain = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

async function fetchHtml(path, { ajax = false, cookie, referer, params } = {}) {
  const url = new URL(path, teletal);
  if (params) {
    // Teletál expects percent-encoded spaces in section names.
    url.search = Object.entries(params).map(([key, value]) =>
      encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
  }
  const headers = { 'Accept-Language': 'hu-HU,hu;q=0.9' };
  if (ajax) headers['X-Requested-With'] = 'XMLHttpRequest';
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(9_000) });
  if (!response.ok) throw new Error(`Teletál returned HTTP ${response.status}`);
  return { $: load(await response.text()), response };
}

function pendingPool(items, width, task) {
  const values = new Array(items.length);
  let cursor = 0;
  return Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      values[index] = await task(items[index]);
    }
  })).then(() => values);
}

function classify(section, title, code) {
  const key = plain(section);
  const name = plain(title);
  if (/^(menu|vakacio|z10|z11|z12|irn?$)/.test(key)
    || /^ZR7$|^SU\d$|^Z1[012]$/.test(code)) return 'menu';
  if (key.startsWith('desszert') || code === 'ZR8' || code === 'Z9') return 'dessert';
  if (key === 'leves' || key === 'v1' || name.includes('leves')) return 'soup';
  return 'main';
}

function readMenuName(card) {
  const heading = card.closest('tr').children('.menu-cell-code-sub2').find('h2').first().clone();
  const schoolMenu = heading.find('img[src]').first().attr('src')?.match(/(?:^|\/)sulido(\d+)(?=[_.-]|$)/i)?.[1];
  if (schoolMenu) return `Sulidő ${schoolMenu}`;

  heading.find('br').replaceWith('|');
  const label = cleanText(heading.text().split('|')[0]);
  if (!label || /^\d[\d.,\s]*\s*Ft\b/i.test(label)) return null;
  return label === label.toLocaleUpperCase('hu')
    ? label.toLocaleLowerCase('hu').replace(/(^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase('hu'))
    : label;
}

function itemsFrom($, section, headings) {
  const { category, cuisine } = headings.get(section);
  return $(detailSelector).toArray().flatMap(entry => {
    const anchor = $(entry);
    const day = Number(anchor.attr('nap'));
    const code = anchor.attr('kod')?.toUpperCase();
    const type = Number(anchor.attr('tipus') ?? 1);
    if (day < 1 || day > 5 || !dishCodePattern.test(code ?? '') || !Number.isInteger(type)) return [];

    const card = anchor.closest('.menu-card, .mc');
    const input = card.find('input[ar]').first();
    const price = Number(input.attr('ar')?.replace(',', '.'));
    if (!input.length || input.is('[disabled]') || !Number.isFinite(price) || price <= 0) return [];

    const titleNodes = card.find('.menu-cell-text-row.uk-text-break, .menu-cell-text-row.uk-text-small, .menu-item-title').first().clone();
    titleNodes.find('br').replaceWith(' / ');
    const name = cleanText(titleNodes.text()).replace(/,\s*\/\s*/g, ' / ').replace(/\s*\/\s*$/, '') || category;
    const kind = classify(section, name, code);
    const menuName = kind === 'menu' ? readMenuName(card) : null;
    const weekend = card.find('img[title]').toArray().some(img => plain($(img).attr('title')).includes('szombat'));
    return [{ id: `${day}:${type}:${code}`, day, type, code, kind, name, price,
      category: menuName?.startsWith('Sulidő ') ? 'Sulidő' : category, cuisine, menuName, weekend }];
  });
}

export async function publishedWeeks() {
  const { $ } = await fetchHtml('/etlap');
  const form = $('#etlap_form');
  const current = Number(form.attr('het'));
  const year = Number(form.attr('ev'));
  if (!current || !year) throw new Error('The current Teletál week was missing');
  const reference = mondayOfWeek(`${year}-W${String(current).padStart(2, '0')}`) ?? todayInBudapest();
  const possibleWeeks = new Map();
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

export async function menuCatalog(key) {
  const [year, weekWithZero] = key.split('-W');
  const week = String(Number(weekWithZero));
  const path = `/etlap/${week}`;
  const { $, response } = await fetchHtml(path);
  const form = $('#etlap_form');
  if (form.attr('ev') !== year || Number(form.attr('het')) !== Number(week)) {
    throw new Error('Teletál has not published this week');
  }
  const cookie = response.headers.get('set-cookie')?.match(/PHPSESSID=[^;,\s]+/i)?.[0];
  const sections = form.find('section[section]').toArray().filter(node => !skippedSections.test(plain($(node).attr('section'))));
  if (!sections.length) throw new Error('The Teletál menu sections were missing');
  const headings = new Map(sections.map(node => {
    const section = $(node);
    const name = section.attr('section');
    const heading = section.find('h2').first();
    const text = cleanText(name === 'Zero' ? heading.find('strong').first().text() : heading.text());
    const [title, ...subtitles] = text.split('|').map(part => part.trim());
    return [name, {
      category: name === 'Vakáció' ? 'Vakáció menü' : title || name,
      cuisine: subtitles.find(subtitle => /\bkonyha$/iu.test(subtitle)) ?? null,
    }];
  }));
  const groups = await pendingPool(sections, 4, async node => {
    const section = $(node);
    const name = section.attr('section');
    if (!section.find('.dummy').length) {
      const scope = load(section.html() ?? '');
      return itemsFrom(scope, name, headings);
    }
    const { $: fragment } = await fetchHtml('/ajax/szekcio', {
      ajax: true, cookie, referer: response.url,
      params: { ev: year, het: week, ewid: section.attr('ewid'), varname: name },
    });
    if (!fragment('tr, .menu-card, .mc').length) throw new Error(`Could not read Teletál’s ${name} section`);
    return itemsFrom(fragment, name, headings);
  });

  const items = [...new Map(groups.flat().map(dish => [dish.id, dish])).values()];
  return items.sort((a, b) => a.day - b.day || sectionSizes.compare(a.code, b.code));
}

function photoUrl(image) {
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

function readComponents($) {
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
      kcal: Number(value.replace(/kcal\s*$/i, '').trim().replaceAll(',', '')),
      kind: courseKinds.get(label),
      photo,
    };
  }).filter(component => Number.isFinite(component.kcal) && component.kcal > 0);
}

export async function nutritionFor(key, ids) {
  const [year, week] = key.split('-W');
  return pendingPool(ids, 4, async id => {
    const [day, type, code] = id.split(':');
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
