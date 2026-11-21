import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cartLinkFragment, importOnTeletal, maxCartLines, teletalWeekUrl } from '../src/web/cart-shortcut.ts';
import type { CartLine } from '../src/core/types.ts';

const plan = { id: '7d8f3c1e-2b4a-4f6d-9e0a-1c2b3d4e5f60', week: '2026-W48' };
const address = '123';
const globalNames = ['location', 'history', 'document', 'localStorage', 'alert', 'confirm', 'fetch', 'DOMParser'] as const;
const originals = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

/** A stand-in for the Teletál menu page and cart, holding quantities by `day:code`. */
function teletalPage(url: string, cart: Record<string, number> = {}, storage = new Map<string, string>()) {
  const { hash } = new URL(url);
  const alerts: string[] = [];
  const posted: unknown[] = [];
  let confirmations = 0;
  let openedCart = false;
  const page = {
    location: {
      origin: 'https://www.teletal.hu',
      hash,
      pathname: '/etlap/48',
      search: '',
      assign: (path: string) => (openedCart = path === '/kosar'),
    },
    history: { replaceState: () => {} },
    document: {
      getElementById: (id: string) =>
        id === 'etlap_form'
          ? { getAttribute: (name: string) => ({ ev: '2026', het: '48' })[name] ?? null }
          : id === 'select-address'
            ? { value: address }
            : null,
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    alert: (message: string) => alerts.push(message),
    confirm: () => {
      confirmations += 1;
      return true;
    },
    fetch: async (path: string, init?: RequestInit) => {
      if (path === '/ajax/adagmentes_all') {
        const body = JSON.parse(String(init?.body));
        posted.push(body);
        for (const [code, days] of Object.entries(body.adagok[address]['2026']['48'] as Record<string, Record<string, string>>)) {
          for (const [day, quantity] of Object.entries(days)) cart[`${day}:${code}`] = Number(quantity);
        }
      }
      return new Response('');
    },
    DOMParser: class {
      parseFromString() {
        return {
          querySelectorAll: () =>
            Object.entries(cart).map(([key, quantity]) => {
              const [day, code] = key.split(':');
              return { getAttribute: () => `2026_48_${address}_${code}_${day}`, value: String(quantity) };
            }),
        };
      }
    },
  };
  Object.assign(globalThis, page);
  return { alerts, posted, cart, storage, opened: () => openedCart, confirmations: () => confirmations };
}

const lines = (...entries: [number, string, number][]): CartLine[] =>
  entries.map(([day, code, quantity]) => ({ day, code, name: code, quantity }));

test('the cart link carries a versioned base64url payload under the Tálválogató fragment', () => {
  const url = teletalWeekUrl(plan, lines([3, 'PN', 1], [6, 'Z10', 1]));
  assert.ok(url.startsWith(`https://www.teletal.hu/etlap/48${cartLinkFragment}`));
  const encoded = url.split(cartLinkFragment)[1]!;
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64url').toString()), {
    v: 1,
    id: plan.id,
    year: '2026',
    week: '48',
    lines: [
      [3, 'PN', 1],
      [6, 'Z10', 1],
    ],
  });
});

test('the bookmark adds weekday and weekend lines on top of the current cart and opens it', async () => {
  const page = teletalPage(teletalWeekUrl(plan, lines([3, 'PN', 1], [5, 'W1', 3], [6, 'Z10', 1], [7, 'Z10', 1])), { '3:PN': 1 });
  await importOnTeletal();
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.posted, [
    { adagok: { [address]: { 2026: { 48: { PN: { 3: '2' }, W1: { 5: '3' }, Z10: { 6: '1', 7: '1' } } } } } },
  ]);
  assert.equal(page.opened(), true);
  assert.deepEqual(JSON.parse(page.storage.get('talvalogato.cart-import')!).targets, {
    '3:PN': 2,
    '5:W1': 3,
    '6:Z10': 1,
    '7:Z10': 1,
  });
});

test('the bookmark accepts up to the line limit and asks for a new bookmark when the link is newer', async () => {
  const many = (count: number) =>
    lines(...Array.from({ length: count }, (_, index): [number, string, number] => [1 + (index % 5), `C${index}`, 1]));
  let page = teletalPage(teletalWeekUrl(plan, many(maxCartLines)));
  await importOnTeletal();
  assert.deepEqual(page.alerts, []);

  page = teletalPage(teletalWeekUrl(plan, many(maxCartLines + 1)));
  await importOnTeletal();
  assert.match(page.alerts[0]!, /érvénytelen/);

  const newer = Buffer.from(JSON.stringify({ v: 2, id: plan.id, year: '2026', week: '48', lines: [[3, 'PN', 1]] })).toString(
    'base64url',
  );
  page = teletalPage(`https://www.teletal.hu/etlap/48${cartLinkFragment}${newer}`);
  await importOnTeletal();
  assert.match(page.alerts[0]!, /Mentsd el újra/);
  assert.deepEqual(page.posted, []);
});

test('links without the Tálválogató fragment are not accepted', async () => {
  const page = teletalPage('https://www.teletal.hu/etlap/48#other=W10%3D');
  await importOnTeletal();
  assert.match(page.alerts[0]!, /Nyisd meg a heti étlapot a Tálválogatóból/);
});

test('running a link again adds nothing while the cart still holds its portions, and adds again once they are gone', async () => {
  const url = teletalWeekUrl(plan, lines([3, 'PN', 1], [6, 'Z10', 1]));
  const first = teletalPage(url);
  await importOnTeletal();
  assert.deepEqual(first.cart, { '3:PN': 1, '6:Z10': 1 });

  // The same link again: nothing to add, so no question and no change.
  const again = teletalPage(url, first.cart, first.storage);
  await importOnTeletal();
  assert.equal(again.confirmations(), 0);
  assert.deepEqual(again.posted, []);
  assert.equal(again.opened(), true);

  // The cart was emptied since: the same link adds the portions again.
  const emptied = teletalPage(url, {}, first.storage);
  await importOnTeletal();
  assert.equal(emptied.confirmations(), 1);
  assert.deepEqual(emptied.cart, { '3:PN': 1, '6:Z10': 1 });

  // The plan changed since: its new lines are added on top of what the cart holds.
  const changed = teletalPage(teletalWeekUrl(plan, lines([3, 'PN', 1], [4, 'P', 1])), emptied.cart, emptied.storage);
  await importOnTeletal();
  assert.deepEqual(changed.cart, { '3:PN': 2, '6:Z10': 1, '4:P': 1 });
});
