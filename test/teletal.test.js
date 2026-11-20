import assert from 'node:assert/strict';
import test from 'node:test';
import { nutritionFor, teletal } from '../src/teletal.js';

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
