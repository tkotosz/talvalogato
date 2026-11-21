import assert from 'node:assert/strict';
import test from 'node:test';
import { sinceLabel } from '../src/web/format.ts';

test('update times read as today, yesterday or a date, in Budapest time', () => {
  const now = new Date('2026-11-21T18:00:00Z');
  assert.equal(sinceLabel('2026-11-21T11:31:00Z', now), 'ma 12:31');
  assert.equal(sinceLabel('2026-11-20T05:02:00Z', now), 'tegnap 06:02');
  assert.equal(sinceLabel('2026-11-19T05:02:00Z', now).replace(/\s+/g, ' '), 'nov. 19. 06:02');
  assert.equal(sinceLabel('2026-11-20T23:30:00Z', now), 'ma 00:30', 'just after midnight in Budapest is already today');
});
