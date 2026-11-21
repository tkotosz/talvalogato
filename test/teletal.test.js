import assert from 'node:assert/strict';
import test from 'node:test';
import { menuCatalog, nutritionFor, teletal } from '../src/teletal.js';

test('catalog entries follow the website order and preserve names for all menu codes', async t => {
  const row = (code, label, day = 4) => `<table><tr>
    <td class="menu-cell-code-sub2"><h2>${label}<br>1.990 FT / NAP</h2></td>
    <td><div class="menu-card">
      <a class="menu-info-button" kod="${code}" nap="${day}" tipus="1"></a>
      <span class="menu-item-title">Leves,<br>Főétel</span><input ar="1990">
    </div></td>
  </tr></table>`;
  t.mock.method(globalThis, 'fetch', async url => new Response(url.pathname === '/etlap/48' ? `
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
  ` : {
    Menü: row('R', 'EXTRA MENÜ') + row('P', 'MENÜ 1', 2),
    Vakáció: row('SU1', '<img src="/hirkep/sulido1_100.png">'),
    Savanyúság: row('W1', 'Savanyúság') + row('W2', 'Savanyúság', 6),
    CzanikBalazs: row('Z1', 'Balázsfitness', 1) + row('Z2', 'Balázsfit<br><font>(csökkentett mennyiség:<br> max. 30 dkg)</font>')
      + row('Z5', 'OFFICE MENÜ'),
    Z10: row('Z10', ''),
    Z11: row('Z11', ''),
    IR: row('IR', ''),
    IRN: row('IRN', ''),
    V1: row('TVE1', 'LEVES'),
    V2: row('TV2', 'VEGA'),
    V3: row('TVE5', 'VEGÁN'),
    szejtan: row('TV7', 'SZEJTÁNNAL KÉSZÜLT ÉTELEK'),
    Xixo: row('NF1', 'XIXO COLA'),
  }[url.searchParams.get('varname')]));

  const catalog = await menuCatalog('2026-W48');
  assert.deepEqual(catalog.map(({ code, section, menuName, category, cuisine }) => [code, section, menuName, category, cuisine]), [
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
  ]);
  assert.deepEqual(catalog.filter(dish => dish.groupId === 'Vega & vegán').map(({ code }) => code), ['TVE1', 'TV2', 'TVE5', 'TV7']);
  assert.deepEqual(catalog.filter(dish => !dish.pickerEligible).map(({ code }) => code), ['ZK', 'W1', 'W2', 'NF1']);
  assert.equal(catalog.find(dish => dish.code === 'Z5').kind, 'menu');
  assert.ok(catalog.every(({ name, price }) => name === 'Leves / Főétel' && price === 1990));
});

test('menu photos stay with their own courses when a course has no photo', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(`
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
  `));

  const [menu] = await nutritionFor('2026-W48', ['1:1:Q']);
  assert.equal(menu.kcal, 650);
  assert.equal(menu.components[2].kcal, 0);
  assert.deepEqual(menu.components.map(({ kind, photo }) => [kind, photo]), [
    ['soup', `${teletal}/etel_kepek/soup.jpg`],
    ['main', null],
    ['dessert', `${teletal}/etel_kepek/dessert.jpg`],
  ]);
  assert.equal(menu.photo, menu.components[0].photo);
});
