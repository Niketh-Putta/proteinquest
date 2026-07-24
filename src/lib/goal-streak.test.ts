import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accountGoalStreakState,
  effectiveStreak,
  goalHitStreakDays,
  nextGoalStreak,
} from './goal-streak.ts';
import type { Profile } from './types.ts';

function baseProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    display_name: 'tester',
    avatar_url: null,
    invite_code: null,
    age: 20,
    weight_kg: 70,
    sex: 'male',
    activity_level: 'moderate',
    goal_type: 'build_muscle',
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
    dragon_progress: {},
    ...over,
  };
}

test('goalHitStreakDays counts consecutive calendar goal hits', () => {
  const totals = {
    '2026-07-23': 100,
    '2026-07-24': 120,
    '2026-07-25': 110,
  };
  assert.equal(goalHitStreakDays(totals, 100, '2026-07-25', '2026-07-24'), 3);
  assert.equal(goalHitStreakDays(totals, 100, '2026-07-26', '2026-07-25'), 3);
  assert.equal(goalHitStreakDays({ '2026-07-25': 50 }, 100, '2026-07-25', '2026-07-24'), 0);
});

test('goalHitStreakDays breaks on a miss and supports one freeze gap', () => {
  const totals = {
    '2026-07-22': 100,
    '2026-07-23': 40,
    '2026-07-24': 100,
    '2026-07-25': 100,
  };
  assert.equal(goalHitStreakDays(totals, 100, '2026-07-25', '2026-07-24'), 2);
  assert.equal(
    goalHitStreakDays(totals, 100, '2026-07-25', '2026-07-24', { freezeKeepsAlive: true }),
    3,
  );
});

test('accountGoalStreakState recovers streak wiped onto profile by empty dragon', () => {
  const profile = baseProfile({
    streak: 0,
    best_streak: 0,
    last_goal_date: null,
    active_dragon_id: 'ice',
    daily_dragon_id: 'ice',
    daily_dragon_date: '2026-07-25',
    dragon_progress: {
      fire: {
        xp: 300,
        level: 2,
        streak: 3,
        best_streak: 3,
        goals_hit: 3,
        last_goal_date: '2026-07-25',
      },
      ice: {
        xp: 50,
        level: 2,
        streak: 0,
        best_streak: 0,
        goals_hit: 0,
        last_goal_date: null,
      },
    },
  });
  const account = accountGoalStreakState(profile);
  assert.equal(account.streak, 3);
  assert.equal(account.last_goal_date, '2026-07-25');
  assert.equal(
    effectiveStreak(
      { ...account, xp: 50, goals_hit: 0 },
      '2026-07-25',
      '2026-07-24',
    ),
    3,
  );
});

test('nextGoalStreak continues across days and resets after a miss', () => {
  assert.deepEqual(
    nextGoalStreak('2026-07-24', 2, '2026-07-25', '2026-07-24', false),
    { streak: 3, streakFreezeUsed: false },
  );
  assert.deepEqual(
    nextGoalStreak('2026-07-23', 2, '2026-07-25', '2026-07-24', true),
    { streak: 3, streakFreezeUsed: true },
  );
  assert.deepEqual(
    nextGoalStreak(null, 0, '2026-07-25', '2026-07-24', false),
    { streak: 1, streakFreezeUsed: false },
  );
});
