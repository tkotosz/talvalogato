import assert from 'node:assert/strict';
import test from 'node:test';
import { menuCatalog, nutritionFor, teletal } from '../src/teletal.js';

test('catalog entries preserve the table menu name, kitchen, and Sulidő branding', async t => {
  const row = (code, label) => `<table><tr>
    <td class="menu-cell-code-sub2"><h2>${label}<br>1.990 FT / NAP</h2></td>
    <td><div class="menu-card">
      <a class="menu-info-button" kod="${code}" nap="4" tipus="1"></a>
      <span class="menu-item-title">Leves,<br>Főétel</span><input ar="1990">
    </div></td>
  </tr></table>`;
  t.mock.method(globalThis, 'fetch', async url => new Response(url.pathname === '/etlap/48' ? `
    <form id="etlap_form" ev="2026" het="48">
      <section section="Menü" ewid="1"><h2>Menü | Hagyományos konyha |</h2><div class="dummy"></div></section>
      <section section="Vakáció" ewid="1"><h2>Menü | Heti ajánlat</h2><div class="dummy"></div></section>
    </form>
  ` : url.searchParams.get('varname') === 'Menü' ? row('R', 'EXTRA MENÜ')
    : row('SU1', '<img src="/hirkep/sulido1_100.png">')));

  const catalog = await menuCatalog('2026-W48');
  assert.deepEqual(catalog.map(({ code, menuName, category, cuisine, name, price }) =>
    [code, menuName, category, cuisine, name, price]), [
    ['R', 'Extra Menü', 'Menü', 'Hagyományos konyha', 'Leves / Főétel', 1990],
    ['SU1', 'Sulidő 1', 'Sulidő', null, 'Leves / Főétel', 1990],
  ]);
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
    <span class="en_adag">180 kcal</span>
  `));

  const [menu] = await nutritionFor('2026-W48', ['1:1:Q']);
  assert.equal(menu.kcal, 830);
  assert.deepEqual(menu.components.map(({ kind, photo }) => [kind, photo]), [
    ['soup', `${teletal}/etel_kepek/soup.jpg`],
    ['main', null],
    ['dessert', `${teletal}/etel_kepek/dessert.jpg`],
  ]);
  assert.equal(menu.photo, menu.components[0].photo);
});
