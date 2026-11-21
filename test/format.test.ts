import assert from 'node:assert/strict';
import test from 'node:test';
import { shareLink, sinceLabel } from '../src/web/format.ts';

test('update times read as today, yesterday or a date, in Budapest time', () => {
  const now = new Date('2026-11-21T18:00:00Z');
  assert.equal(sinceLabel('2026-11-21T11:31:00Z', now), 'ma 12:31');
  assert.equal(sinceLabel('2026-11-20T05:02:00Z', now), 'tegnap 06:02');
  assert.equal(sinceLabel('2026-11-19T05:02:00Z', now).replace(/\s+/g, ' '), 'nov. 19. 06:02');
  assert.equal(sinceLabel('2026-11-20T23:30:00Z', now), 'ma 00:30', 'just after midnight in Budapest is already today');
});

function withNavigator(stub: Partial<Navigator>, run: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: stub, configurable: true });
  return run().finally(() => Object.defineProperty(globalThis, 'navigator', original!));
}

test('a link opens the share sheet where the device has one', async () => {
  const shared: ShareData[] = [];
  await withNavigator({ share: async data => void shared.push(data!) }, async () => {
    assert.equal(await shareLink('Heti rendelés', 'https://example.test/#a'), 'shared');
  });
  assert.deepEqual(shared, [{ title: 'Heti rendelés', url: 'https://example.test/#a' }]);
});

test('closing the share sheet copies nothing', async () => {
  const copied: string[] = [];
  const share = async () => {
    throw new DOMException('Share canceled', 'AbortError');
  };
  await withNavigator(
    { share, clipboard: { writeText: async (text: string) => void copied.push(text) } as Clipboard },
    async () => {
      assert.equal(await shareLink('Heti rendelés', 'https://example.test/#a'), 'cancelled');
    },
  );
  assert.deepEqual(copied, []);
});

test('a link is copied where sharing is missing or refused', async () => {
  const copied: string[] = [];
  const clipboard = { writeText: async (text: string) => void copied.push(text) } as Clipboard;
  const refuse = async () => {
    throw new DOMException('Not allowed', 'NotAllowedError');
  };
  await withNavigator({ clipboard }, async () => {
    assert.equal(await shareLink('Heti rendelés', 'https://example.test/#a'), 'copied');
  });
  await withNavigator({ share: refuse, clipboard }, async () => {
    assert.equal(await shareLink('Heti rendelés', 'https://example.test/#b'), 'copied');
  });
  await withNavigator({}, async () => {
    assert.equal(await shareLink('Heti rendelés', 'https://example.test/#c'), 'failed');
  });
  assert.deepEqual(copied, ['https://example.test/#a', 'https://example.test/#b']);
});
