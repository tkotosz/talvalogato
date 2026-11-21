import assert from 'node:assert/strict';
import test from 'node:test';
import { serveApi } from '../src/worker/api.ts';

const api = (path: string, env?: { MENU_DATA_URL?: string }) => serveApi(new URL(path, 'https://talvalogato.example'), env);

test('the API hands out the published menu data files', async t => {
  const fetched: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    fetched.push(String(url));
    return url.pathname.endsWith('2026-W99.json') ? new Response('', { status: 404 }) : new Response('{"weeks":[]}');
  });

  const weeks = await api('/api/weeks');
  assert.equal(weeks.status, 200);
  assert.equal(weeks.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(weeks.headers.get('Cache-Control'), 'public, max-age=300');
  assert.deepEqual(await weeks.json(), { weeks: [] });

  await api('/api/menu?week=2026-W48', { MENU_DATA_URL: 'http://127.0.0.1:4173/__dev/menu/' });
  assert.deepEqual(fetched, [
    'https://raw.githubusercontent.com/tkotosz/talvalogato/data/menu/weeks.json',
    'http://127.0.0.1:4173/__dev/menu/2026-W48.json',
  ]);

  assert.equal((await api('/api/menu?week=2026-W53')).status, 200);
  assert.equal((await api('/api/menu?week=2026-W99')).status, 400, 'an impossible week is refused before fetching');
  assert.equal((await api('/api/menu?week=../weeks')).status, 400);
  assert.equal((await api('/api/nutrition?week=2026-W48')).status, 404);
});

test('a missing week is reported as unpublished, and an unreachable data source as unavailable', async t => {
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    if (url.pathname.endsWith('2026-W50.json')) return new Response('', { status: 404 });
    throw new Error('offline');
  });
  const missing = await api('/api/menu?week=2026-W50');
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /közzétett hetek/);
  const down = await api('/api/weeks');
  assert.equal(down.status, 502);
  assert.equal(down.headers.get('Cache-Control'), 'no-store');
});
