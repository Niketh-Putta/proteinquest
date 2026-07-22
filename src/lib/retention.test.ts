import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GRANDFATHER_CUTOFF_ISO,
  careStreakDays,
  isGrandfathered,
  markCareDay,
  rollLootDrop,
} from './retention.ts';
import type { Profile } from './types.ts';

const base = { id: 'u1' } as Profile;

test('grandfather by created_at cutoff', () => {
  assert.equal(
    isGrandfathered({ ...base, created_at: '2026-07-20T12:00:00.000Z' }),
    true,
  );
  assert.equal(
    isGrandfathered({ ...base, created_at: '2026-07-22T12:00:00.000Z' }),
    false,
  );
  assert.ok(Date.parse(GRANDFATHER_CUTOFF_ISO) > 0);
});

test('grandfather by lifetime meals', () => {
  assert.equal(
    isGrandfathered({ ...base, created_at: '2026-07-22T12:00:00.000Z' }, 3),
    true,
  );
  assert.equal(
    isGrandfathered({ ...base, created_at: '2026-07-22T12:00:00.000Z' }, 2),
    false,
  );
});

test('loot pity drops by seventh meal', () => {
  const r = rollLootDrop({ loot_meals_since_drop: 6 });
  assert.equal(r.dropped, true);
  assert.equal(r.next.loot_meals_since_drop, 0);
  assert.equal(r.next.egg_shards, 1);
});

test('markCareDay is idempotent per day', () => {
  const a = markCareDay({}, '2026-07-22');
  const b = markCareDay(a, '2026-07-22');
  assert.deepEqual(a.care_days, ['2026-07-22']);
  assert.deepEqual(b.care_days, ['2026-07-22']);
});

test('careStreakDays counts consecutive days from today or yesterday', () => {
  const r = {
    care_days: ['2026-07-20', '2026-07-21', '2026-07-22'],
  };
  assert.equal(careStreakDays(r, '2026-07-22', '2026-07-21'), 3);
  assert.equal(careStreakDays({ care_days: ['2026-07-21'] }, '2026-07-22', '2026-07-21'), 1);
  assert.equal(careStreakDays({}, '2026-07-22', '2026-07-21'), 0);
});
