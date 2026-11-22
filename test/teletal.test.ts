import assert from 'node:assert/strict';
import test from 'node:test';
import { detailsFor, menuCatalog, teletal } from '../src/scraper/teletal.ts';

test('catalog entries follow the website order and preserve names for all menu codes', async t => {
  const row = (code: string, label: string, day = 4) => `<table><tr>
    <td class="menu-cell-code-sub2"><h2>${label}<br>1.990 FT / NAP</h2></td>
    <td><div class="menu-card">
      <a class="menu-info-button" kod="${code}" nap="${day}" tipus="1"></a>
      <span class="menu-item-title">Leves,<br>Főétel</span><input ar="1990">
    </div></td>
  </tr></table>`;
  const page = `
    <form id="etlap_form" ev="2026" het="48">
      <section section="promocio"><h2>A mi csapatunk kedvencei!</h2>${row('25', 'A mi csapatunk<br>kedvencei!')}</section>
      <section section="Reggeli"><h2>Pékáru és ZabKása | Hagyományos konyha</h2>${row('ZK', 'ZabKása')}</section>
      <section section="Tésztás Ételek"><h2>Tészták</h2>${row('G', 'Tészták')}${row('H1', 'Húsos tészták')}</section>
      <section section="Olasz Tészták"><h2>Tészták</h2>${row('H2', 'OLASZ<br>TÉSZTÁK')}</section>
      <section section="Tortillák"><h2>Tortilla világa</h2>${row('H3', '')}</section>
      <section section="ZTortilla"><h2>Tortilla világa</h2>${row('ZT', '')}</section>
      <section section="Menü" ewid="1"><h2>Menü | Hagyományos konyha |</h2><div class="dummy"></div></section>
      <section section="Vakáció" ewid="1"><h2>Menü | Heti ajánlat</h2><div class="dummy"></div></section>
      <section section="Desszert"><h2>DESSZERT ÉS SÜTEMÉNY</h2>${row('T1', 'Sütemények')}</section>
      <section section="ZZabkasa"><h2>ZabKása</h2>${row('ZK', 'ZabKása')}</section>
      <section section="Savanyúság" ewid="1"><h2>Savanyúság | Hagyományos konyha</h2><div class="dummy"></div></section>
      <section section="CzanikBalazs" ewid="1"><h2>CZANIK BALÁZS FITNESS EDZŐ AJÁNLATA |</h2><div class="dummy"></div></section>
      <section section="Z10" class="teletal-speedfitt" ewid="1"><div class="dummy"></div></section>
      <section section="Z11" class="teletal-z11" ewid="1"><div class="dummy"></div></section>
      <section section="IR" ewid="1"><div class="dummy"></div></section>
      <section section="IRN" ewid="1"><div class="dummy"></div></section>
      <section section="V1" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
      <section section="V2" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
      <section section="V3" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
      <section section="szejtan" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
      <section section="Xixo" ewid="1"><span class="title-xixo">NAPI FRISSÍTŐK</span><div class="dummy"></div></section>
    </form>
  `;
  const sections: Record<string, string> = {
    Menü: row('R', 'EXTRA MENÜ') + row('P', 'MENÜ 1', 2),
    Vakáció: row('SU1', '<img src="/hirkep/sulido1_100.png">'),
    Savanyúság: row('W1', 'Savanyúság') + row('W2', 'Savanyúság', 6),
    CzanikBalazs:
      row('Z1', 'Balázsfitness', 1) +
      row('Z2', 'Balázsfit<br><font>(csökkentett mennyiség:<br> max. 30 dkg)</font>') +
      row('Z5', 'OFFICE MENÜ'),
    Z10: row('Z10', ''),
    Z11: row('Z11', ''),
    IR: row('IR', ''),
    IRN: row('IRN', ''),
    V1: row('TVE1', 'LEVES'),
    V2: row('TV2', 'VEGA'),
    V3: row('TVE5', 'VEGÁN'),
    szejtan: row('TV7', 'SZEJTÁNNAL KÉSZÜLT ÉTELEK'),
    Xixo: row('NF1', 'XIXO COLA'),
  };
  t.mock.method(
    globalThis,
    'fetch',
    async (url: URL) => new Response(url.pathname === '/etlap/48' ? page : sections[url.searchParams.get('varname') ?? '']),
  );

  const catalog = await menuCatalog('2026-W48');
  assert.deepEqual(
    catalog.map(({ code, section, menuName, category, cuisine }) => [code, section, menuName, category, cuisine]),
    [
      ['25', 'promocio', 'A mi csapatunk kedvencei!', 'A mi csapatunk kedvencei!', null],
      ['ZK', 'Reggeli', 'ZabKása', 'Pékáru és ZabKása', 'Hagyományos konyha'],
      ['G', 'Tésztás Ételek', 'Tészták', 'Tésztás ételek', null],
      ['H1', 'Tésztás Ételek', 'Húsos tészták', 'Tésztás ételek', null],
      ['H2', 'Olasz Tészták', 'Olasz Tészták', 'Olasz tészták', null],
      ['H3', 'Tortillák', 'Tortilla világa', 'Tortilla világa', null],
      ['ZT', 'ZTortilla', 'Tortilla világa', 'Tortilla világa', null],
      ['R', 'Menü', 'Extra Menü', 'Menü', 'Hagyományos konyha'],
      ['P', 'Menü', 'Menü 1', 'Menü', 'Hagyományos konyha'],
      ['SU1', 'Vakáció', 'Sulidő 1', 'Sulidő', null],
      ['T1', 'Desszert', 'Sütemények', 'Desszert és sütemény', null],
      ['W1', 'Savanyúság', 'Savanyúság', 'Savanyúság', 'Hagyományos konyha'],
      ['W2', 'Savanyúság', 'Savanyúság', 'Savanyúság', 'Hagyományos konyha'],
      ['Z1', 'CzanikBalazs', 'Balázsfitness', 'Czanik Balázs fitness edző ajánlata', null],
      ['Z2', 'CzanikBalazs', 'Balázsfit (csökkentett mennyiség: max. 30 dkg)', 'Czanik Balázs fitness edző ajánlata', null],
      ['Z5', 'CzanikBalazs', 'Office Menü', 'Czanik Balázs fitness edző ajánlata', null],
      ['Z10', 'Z10', 'Full Day menü', 'Full Day menü', null],
      ['Z11', 'Z11', '8/16 időszakos böjt menü', '8/16 időszakos böjt menü', null],
      ['IR', 'IR', 'Inzulinrezisztens menü (85 g CH/nap)', 'Inzulinrezisztens menü (85 g CH/nap)', null],
      ['IRN', 'IRN', 'Inzulinrezisztens menü (160 g CH/nap)', 'Inzulinrezisztens menü (160 g CH/nap)', null],
      ['TVE1', 'V1', 'Leves', 'Vega & vegán', null],
      ['TV2', 'V2', 'Vega', 'Vega & vegán', null],
      ['TVE5', 'V3', 'Vegán', 'Vega & vegán', null],
      ['TV7', 'szejtan', 'Szejtánnal Készült Ételek', 'Vega & vegán', null],
      ['NF1', 'Xixo', 'Xixo Cola', 'Napi frissítők', null],
    ],
  );
  assert.deepEqual(
    catalog.filter(dish => dish.groupId === 'Vega & vegán').map(({ code }) => code),
    ['TVE1', 'TV2', 'TVE5', 'TV7'],
  );
  assert.deepEqual(
    catalog.filter(dish => !dish.pickerEligible).map(({ code }) => code),
    ['ZK', 'W1', 'W2', 'NF1'],
  );
  assert.equal(catalog.find(dish => dish.code === 'Z5')?.kind, 'menu');
  assert.ok(catalog.every(({ name, price }) => name === 'Leves / Főétel' && price === 1990));
  // Every fixture dish is named "Leves / Főétel", so the name rule makes the non-dessert dishes soups here.
  assert.deepEqual(Object.fromEntries(catalog.map(({ code, course }) => [code, course])), {
    25: 'soup',
    ZK: 'breakfast',
    G: 'soup',
    H1: 'soup',
    H2: 'soup',
    H3: 'soup',
    ZT: 'soup',
    R: null,
    P: null,
    SU1: null,
    T1: 'dessert',
    W1: 'pickle',
    W2: 'pickle',
    Z1: 'soup',
    Z2: 'soup',
    Z5: null,
    Z10: null,
    Z11: null,
    IR: null,
    IRN: null,
    TVE1: 'soup',
    TV2: 'soup',
    TVE5: 'soup',
    TV7: 'soup',
    NF1: 'drink',
  });
});

test('drink names ignore the style block inside them, promotion lines move from names to notes, and mains, cold dishes, bread and drinks get their courses', async t => {
  // The drink card markup as Teletál serves it, including the unclosed tag before the name.
  const drink = `<table><tr kod="NF1"><td class="menu-cell-code-sub2"><h2>XIXO COLA</h2></td><td>
    <div class="menu-card"><div class="menu-cell-text-row uk-text-break"><style>.loc_kep_110632748 {mix-blend-mode: multiply;}</style>
      <div class=loc_kep_110632748></div <br/> XIXO Cola, cukorral és édesítőszerrel</div>
      <a class="menu-info-button" kod="NF1" nap="3" tipus="1"></a><input ar="199"></div></td></tr></table>`;
  const bread = `<table><tr><td class="menu-cell-code-sub2"><h2>Cipó</h2></td><td><div class="menu-card">
    <span class="menu-item-title">Kenyércipó (burgonyás)</span><a class="menu-info-button" kod="X" nap="3" tipus="1"></a><input ar="345">
    </div></td></tr></table>`;
  const main = bread
    .replace('Cipó', 'Főételek')
    .replace('Kenyércipó (burgonyás)', 'Sült kolbász, petrezselymes burgonya')
    .replace('kod="X"', 'kod="I"')
    .replace('ar="345"', 'ar="1990"');
  const cold = bread
    .replace('Cipó', 'Hidegkonyha')
    .replace('Kenyércipó (burgonyás)', 'Norvég saláta')
    .replace('kod="X"', 'kod="D"')
    .replace('ar="345"', 'ar="1590"');
  const promotion = bread
    .replace('Cipó', 'A mi csapatunk kedvencei!')
    .replace('Kenyércipó (burgonyás)', 'Mákos guba<br>-25% RENDEZŐK KEDVENCE<br>Eredeti ár: 1.745 Ft')
    .replace('kod="X"', 'kod="25"')
    .replace('ar="345"', 'ar="1310"');
  const page = `<form id="etlap_form" ev="2026" het="48">
    <section section="promocio"><h2>A mi csapatunk kedvencei!</h2>${promotion}</section>
    <section section="Főételek"><h2>Főételek</h2>${main}</section>
    <section section="Hidegkonyha"><h2>Hidegkonyhai készítmények</h2>${cold}</section>
    <section section="Cipó"><h2>Cipó</h2>${bread}</section>
    <section section="Xixo" ewid="1"><span class="title-xixo">NAPI FRISSÍTŐK</span><div class="dummy"></div></section>
  </form>`;
  t.mock.method(globalThis, 'fetch', async (url: URL) => new Response(url.pathname === '/etlap/48' ? page : drink));

  const catalog = await menuCatalog('2026-W48');
  assert.deepEqual(
    catalog.map(({ code, name, course, price, note }) => [code, name, course, price, note]),
    [
      ['25', 'Mákos guba', 'main', 1310, '-25% RENDEZŐK KEDVENCE · Eredeti ár: 1.745 Ft'],
      ['I', 'Sült kolbász, petrezselymes burgonya', 'main', 1990, null],
      ['D', 'Norvég saláta', 'cold', 1590, null],
      ['X', 'Kenyércipó (burgonyás)', 'bread', 345, null],
      ['NF1', 'XIXO Cola, cukorral és édesítőszerrel', 'drink', 199, null],
    ],
  );
});

test('menu photos stay with their own courses when a course has no photo', async t => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(`
    <h1 class="uk-article-title uk-background-secondary">Menü</h1>
    <h2>Hétfő: Q (1) leves</h2>
    <h1 class="uk-article-title">Leves</h1>
    <div><img src="/icons/badge.png"><img srcset="/etel_kepek/soup-small.jpg 200w, /etel_kepek/soup.jpg 640w"></div>
    <span class="en_adag">240 kcal</span>
    <h2>Hétfő: Q (2) főétel</h2>
    <h1 class="uk-article-title">Főétel</h1>
    <div><img srcset="https://images.example/main.jpg 640w"></div>
    <span class="en_adag">410 kcal</span>
    <h2>Hétfő: Q (3) desszert</h2>
    <h1 class="uk-article-title">Desszert</h1>
    <img src="/etel_kepek/dessert.jpg">
    <span class="en_adag">0 kcal</span>
  `),
  );

  const [menu] = await detailsFor('2026-W48', ['1:1:Q'], () => {});
  assert.ok(menu?.components);
  assert.equal(menu.kcal, 650);
  assert.equal(menu.components[2].kcal, 0);
  assert.deepEqual(
    menu.components.map(({ kind, photo }) => [kind, photo]),
    [
      ['soup', `${teletal}/etel_kepek/soup.jpg`],
      ['main', null],
      ['dessert', `${teletal}/etel_kepek/dessert.jpg`],
    ],
  );
  assert.equal(menu.photo, menu.components[0].photo);
});

/** One part of a course, such as a pasta or its cheese: its ingredient list and allergen list. Null leaves that row out. */
type Part = [ingredients: string | null, allergens: string | null];

/** A detail page course in Teletál's layout, with a net weight, an ingredient list and an allergen list for each part. */
function detailCourse(index: number, name: string, kcal: number, ...parts: Part[]) {
  const row = (label: string, value: string) =>
    `<div class="uk-text-small uk-margin"><span uk-icon="icon: tag"></span><span><strong>${label}</strong></span><span>${value}</span></div>`;
  const rows = parts.map(
    ([ingredients, allergens], part) =>
      (part ? `<div class="uk-grid-small uk-text-bold"><div class="uk-width-expand">Feltét</div></div>` : '') +
      row('Nettó súly:', '100 g') +
      (ingredients === null ? '' : row('Összetevők:', ingredients)) +
      (allergens === null ? '' : row('Allergének:', allergens)),
  );
  return `<section><div class="uk-container"><h2>48.hét Hétfő: Q (${index}) foetel</h2>
    <h1 class="uk-article-title">${name}</h1>
    <div class="uk-grid"><div><span class="en_adag">1 adagban</span><span class="en_adag">${kcal} kcal</span></div>
      <div>${rows.join('')}</div>
    </div></div></section>`;
}

const detailPage = (...courses: string[]) =>
  `<h1 class="uk-article-title uk-background-secondary">Q menü</h1>${courses.join('')}`;

test('course allergens join the allergen list and the bold ingredients, and anything unclear leaves them unknown', async t => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        detailPage(
          detailCourse(1, 'Zöldségleves', 200, [
            'víz, sárgarépa, <strong>zeller</strong>, tészta (<strong>búzaliszt</strong>, <strong>tojás</strong>)',
            'Zeller, Glutén',
          ]),
          detailCourse(2, 'Párolt rizs', 300, ['rizs, víz, só', '-']),
          detailCourse(3, 'Csodasaláta', 150, ['saláta, <strong>tej</strong>', 'Tej, Csodabogyó']),
          detailCourse(4, 'Titkos szósz', 100, ['paradicsom, <strong>rejtélyes adalék</strong>', 'Mustár']),
          detailCourse(5, 'Savanyú káposzta', 50, ['káposzta, ecet, <strong>kén- dioxid</strong>', 'Kén-dioxid']),
          detailCourse(6, 'Kenyér', 250, [null, 'Glutén']),
          detailCourse(7, 'Túrós tészta', 400, ['tészta, <strong>tehéntej</strong>', 'Tej/Laktóz']),
        ),
      ),
  );
  const warnings: string[] = [];
  const [menu] = await detailsFor('2026-W48', ['1:1:Q'], message => warnings.push(message));
  assert.equal(menu?.kcal, 1450);
  assert.deepEqual(
    menu?.components?.map(({ allergens }) => allergens),
    [['gluten', 'egg', 'celery'], [], null, null, ['sulfites'], ['gluten'], ['milk']],
  );
  assert.deepEqual(
    menu?.components?.map(({ ingredients }) => ingredients),
    [
      'víz, sárgarépa, zeller, tészta (búzaliszt, tojás)',
      'rizs, víz, só',
      'saláta, tej',
      'paradicsom, rejtélyes adalék',
      'káposzta, ecet, kén- dioxid',
      null,
      'tészta, tehéntej',
    ],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /1:1:Q.*Csodabogyó, rejtélyes adalék/);
});

test('a course in parts joins their allergens, and a part without an allergen list leaves its course unknown', async t => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        detailPage(
          detailCourse(
            1,
            'Spagetti sajttal',
            700,
            ['spagetti (<strong>búzaliszt</strong>)', 'Glutén'],
            ['(<strong>tej</strong>, oltóenzim)', 'Tej'],
          ),
          detailCourse(2, 'Csirke szósszal', 600, ['csirke', '-'], ['szósz (<strong>mustár</strong>)', null]),
        ),
      ),
  );
  const [menu] = await detailsFor('2026-W48', ['1:1:Q'], () => {});
  assert.deepEqual(
    menu?.components?.map(({ allergens }) => allergens),
    [['gluten', 'milk'], null],
  );
  assert.equal(menu?.components?.[0]?.ingredients, 'spagetti (búzaliszt); (tej, oltóenzim)');
});

test('an allergen row outside every course leaves the whole page unknown', async t => {
  const stray = '<div><span><strong>Allergének:</strong></span><span>Glutén</span></div>';
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(stray + detailPage(detailCourse(1, 'Leves', 200, ['víz, <strong>zeller</strong>', 'Zeller']))),
  );
  const [menu] = await detailsFor('2026-W48', ['1:1:Q'], () => {});
  assert.equal(menu?.kcal, 200);
  assert.deepEqual(
    menu?.components?.map(({ allergens }) => allergens),
    [null],
  );
});

test('lines carry Teletál’s diet and spicy marks from their tag icons, or from the group heading in the Vega & vegán sections', async t => {
  const tag = (...icons: string[]) => `<div class="menu-cell-tag">${icons.map(src => `<img src="${src}">`).join('')}</div>`;
  const row = (code: string, label: string, day: number, tags = '', title = 'Étel') => `<table><tr>
    <td class="menu-cell-code-sub2"><h2>${label}</h2></td>
    <td><div class="menu-card">
      <span class="menu-item-title">${title}</span>
      <div class="menu-info-field"><a class="menu-info-button" kod="${code}" nap="${day}" tipus="1"></a>${tags}</div>
      <input ar="1990">
    </div></td>
  </tr></table>`;
  const page = `<form id="etlap_form" ev="2026" het="48">
    <section section="Főételek"><h2>Főételek</h2>
      ${row('F1', 'Főételek', 1, tag('/theme/teletal/icons/etel_v_jel.png'))}
      ${row('F2', 'Főételek', 1)}
      ${row('F3', 'VEGA', 1)}
      ${row('F4', 'Főételek', 1, '', 'Étel <img src="/hirkep/Vegan_ikon_13x13.png">')}
    </section>
    <section section="V1" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
    <section section="V2" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
    <section section="V3" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
    <section section="szejtan" ewid="1"><span class="title-vega-vegan"></span><div class="dummy"></div></section>
  </form>`;
  const sections: Record<string, string> = {
    V1: row('TVE1', 'LEVES', 1),
    V2: row('TV2', 'VEGA', 1, tag('/hirkep/csipos_jel_pont.png')),
    V3: row('TVE5', 'VEGÁN', 1),
    szejtan:
      row('TV7', 'SZEJTÁNNAL KÉSZÜLT ÉTELEK', 1, tag('/hirkep/Vegan_ikon_13x13.png')) +
      row('TV7', 'SZEJTÁNNAL KÉSZÜLT ÉTELEK', 2, tag('/hirkep/Vega_ikon_13x13.png')) +
      row('TV7', 'SZEJTÁNNAL KÉSZÜLT ÉTELEK', 3),
  };
  t.mock.method(
    globalThis,
    'fetch',
    async (url: URL) => new Response(url.pathname === '/etlap/48' ? page : sections[url.searchParams.get('varname') ?? '']),
  );

  const catalog = await menuCatalog('2026-W48');
  assert.deepEqual(
    catalog.map(({ id, diet, spicy }) => [id, diet, spicy]),
    [
      ['1:1:F1', 'vegetarian', false],
      ['1:1:F2', null, false],
      ['1:1:F3', null, false],
      ['1:1:F4', null, false],
      ['1:1:TVE1', 'vegan', false],
      ['1:1:TV2', 'vegetarian', true],
      ['1:1:TVE5', 'vegan', false],
      ['1:1:TV7', 'vegan', false],
      ['2:1:TV7', 'vegetarian', false],
      ['3:1:TV7', null, false],
    ],
  );
});
