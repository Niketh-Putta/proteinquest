import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CARE_STEP_XP, claimCareXp, getCareSteps } from './care-quests.ts';
import type { Profile } from './types.ts';

/** Stand-in for character.levelForXp — enough for claim math tests. */
function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    display_name: 'Test',
    avatar_url: null,
    invite_code: null,
    age: null,
    weight_kg: null,
    sex: null,
    activity_level: null,
    goal_type: null,
    protein_goal_g: 100,
    onboarded: true,
    intro_completed: true,
    is_premium: false,
    paywall_dismissed: false,
    xp: 0,
    streak: 0,
    best_streak: 0,
    goals_hit: 0,
    last_goal_date: null,
    weight_unit: 'kg',
    active_dragon_id: 'fire',
    daily_dragon_id: null,
    daily_dragon_date: null,
    dragon_progress: {
      fire: { xp: 10, level: 1, streak: 0, best_streak: 0, goals_hit: 0, last_goal_date: null },
    },
    ...overrides,
  };
}

test('CARE_STEP_XP are distinct fixed amounts', () => {
  assert.deepEqual([...CARE_STEP_XP], [25, 35, 50]);
  assert.notEqual(CARE_STEP_XP[0], CARE_STEP_XP[1]);
  assert.notEqual(CARE_STEP_XP[1], CARE_STEP_XP[2]);
});

test('getCareSteps marks feed / second / half correctly', () => {
  const none = getCareSteps({ dragonName: 'Blaze', mealsToday: 0, consumed: 0, goal: 100 });
  assert.equal(none.filter((s) => s.done).length, 0);

  const one = getCareSteps({ dragonName: 'Blaze', mealsToday: 1, consumed: 40, goal: 100 });
  assert.equal(one[0].done, true);
  assert.equal(one[1].done, false);
  assert.equal(one[2].done, false);

  const half = getCareSteps({ dragonName: 'Blaze', mealsToday: 2, consumed: 50, goal: 100 });
  assert.equal(half[0].done, true);
  assert.equal(half[1].done, true);
  assert.equal(half[2].done, true);
});

test('claimCareXp pays task1 only once', () => {
  const p = profile();
  const first = claimCareXp({
    profile: p,
    mealsToday: 1,
    consumed: 20,
    goal: 100,
    todayISO: '2026-08-06',
    dragonName: 'Blaze',
    levelForXp,
  });
  assert.equal(first.gained, 25);
  assert.deepEqual(first.newlyClaimed, [0]);
  assert.ok(first.updates);
  assert.equal(first.updates!.xp, 35);
  assert.deepEqual(first.updates!.retention?.care_xp?.steps, [true, false, false]);

  const again = claimCareXp({
    profile: { ...p, ...first.updates, retention: first.updates!.retention },
    mealsToday: 1,
    consumed: 20,
    goal: 100,
    todayISO: '2026-08-06',
    dragonName: 'Blaze',
    levelForXp,
  });
  assert.equal(again.gained, 0);
  assert.equal(again.updates, null);
});

test('claimCareXp then pays task2 with different XP', () => {
  const p = profile({
    retention: { care_xp: { date: '2026-08-06', steps: [true, false, false] } },
    xp: 35,
    dragon_progress: {
      fire: { xp: 35, level: 1, streak: 0, best_streak: 0, goals_hit: 0, last_goal_date: null },
    },
  });
  const r = claimCareXp({
    profile: p,
    mealsToday: 2,
    consumed: 40,
    goal: 100,
    todayISO: '2026-08-06',
    dragonName: 'Blaze',
    levelForXp,
  });
  assert.equal(r.gained, 35);
  assert.deepEqual(r.newlyClaimed, [1]);
  assert.equal(r.updates!.xp, 70);
});

test('claimCareXp resets on new calendar day', () => {
  const p = profile({
    retention: { care_xp: { date: '2026-08-05', steps: [true, true, true] } },
    xp: 200,
    dragon_progress: {
      fire: { xp: 200, level: 2, streak: 0, best_streak: 0, goals_hit: 0, last_goal_date: null },
    },
  });
  const r = claimCareXp({
    profile: p,
    mealsToday: 1,
    consumed: 30,
    goal: 100,
    todayISO: '2026-08-06',
    dragonName: 'Blaze',
    levelForXp,
  });
  assert.equal(r.gained, 25);
  assert.deepEqual(r.updates!.retention?.care_xp?.steps, [true, false, false]);
  assert.equal(r.updates!.retention?.care_xp?.date, '2026-08-06');
});
