import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hungerFromLastMealAt, hungerLabel, hoursSince } from './dragon-hunger.ts';

const now = Date.parse('2026-07-22T12:00:00.000Z');

test('missing meals are starving', () => {
  assert.equal(hungerFromLastMealAt(null, now), 3);
  assert.equal(hungerFromLastMealAt(undefined, now), 3);
  assert.equal(hungerLabel(3), 'Starving');
});

test('maps hour buckets to hunger levels', () => {
  assert.equal(hungerFromLastMealAt('2026-07-22T11:00:00.000Z', now), 0);
  assert.equal(hungerFromLastMealAt('2026-07-22T08:00:00.000Z', now), 1);
  assert.equal(hungerFromLastMealAt('2026-07-22T04:00:00.000Z', now), 2);
  assert.equal(hungerFromLastMealAt('2026-07-22T01:00:00.000Z', now), 3);
});

test('hoursSince is non-negative', () => {
  assert.equal(hoursSince(null, now), null);
  assert.ok((hoursSince('2026-07-22T10:00:00.000Z', now) ?? 0) >= 1.9);
});
