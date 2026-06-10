import type { ImageSourcePropType } from 'react-native';

import type { Profile } from './types';

// Whey — your protein buddy. Grows stronger as you hit your daily goal.
export interface CharacterStage {
  index: number;
  name: string;
  /** Total daily goals hit required to reach this stage. */
  goalsRequired: number;
  art: ImageSourcePropType;
  tagline: string;
}

export const STAGES: CharacterStage[] = [
  {
    index: 0,
    name: 'Hatchling',
    goalsRequired: 0,
    art: require('@/assets/character/whey-1.png'),
    tagline: 'Feed me protein and watch me grow.',
  },
  {
    index: 1,
    name: 'Rookie',
    goalsRequired: 2,
    art: require('@/assets/character/whey-2.png'),
    tagline: 'On my feet and getting stronger.',
  },
  {
    index: 2,
    name: 'Athlete',
    goalsRequired: 7,
    art: require('@/assets/character/whey-3.png'),
    tagline: 'Training hard. Eating harder.',
  },
  {
    index: 3,
    name: 'Beast',
    goalsRequired: 14,
    art: require('@/assets/character/whey-4.png'),
    tagline: 'Built different. Built by protein.',
  },
  {
    index: 4,
    name: 'Titan',
    goalsRequired: 30,
    art: require('@/assets/character/whey-5.png'),
    tagline: 'Peak form. Keep the streak alive.',
  },
];

export function stageForGoalsHit(goalsHit: number): CharacterStage {
  let stage = STAGES[0];
  for (const s of STAGES) {
    if (goalsHit >= s.goalsRequired) stage = s;
  }
  return stage;
}

export function nextStage(goalsHit: number): CharacterStage | null {
  return STAGES.find((s) => s.goalsRequired > goalsHit) ?? null;
}

export const XP_PER_GRAM = 1;
export const XP_GOAL_BONUS = 100;

/**
 * Called after a log is saved. Returns profile updates + whether the daily
 * goal was crossed by this log (for the celebration moment).
 */
export function applyLogToCharacter(params: {
  profile: Profile;
  todayTotalBefore: number;
  loggedProtein: number;
  todayISO: string;
  yesterdayISO: string;
}): { updates: Partial<Profile>; goalJustHit: boolean; evolved: boolean } {
  const { profile, todayTotalBefore, loggedProtein, todayISO, yesterdayISO } = params;
  const goal = profile.protein_goal_g ?? 0;
  const totalAfter = todayTotalBefore + loggedProtein;

  let xp = (profile.xp ?? 0) + Math.round(loggedProtein * XP_PER_GRAM);
  let streak = profile.streak ?? 0;
  let bestStreak = profile.best_streak ?? 0;
  let goalsHit = profile.goals_hit ?? 0;
  let lastGoalDate = profile.last_goal_date;

  const alreadyHitToday = lastGoalDate === todayISO;
  const goalJustHit = goal > 0 && !alreadyHitToday && totalAfter >= goal;

  const stageBefore = stageForGoalsHit(goalsHit).index;

  if (goalJustHit) {
    xp += XP_GOAL_BONUS;
    goalsHit += 1;
    streak = lastGoalDate === yesterdayISO ? streak + 1 : 1;
    bestStreak = Math.max(bestStreak, streak);
    lastGoalDate = todayISO;
  }

  const evolved = stageForGoalsHit(goalsHit).index > stageBefore;

  return {
    updates: {
      xp,
      streak,
      best_streak: bestStreak,
      goals_hit: goalsHit,
      last_goal_date: lastGoalDate,
    },
    goalJustHit,
    evolved,
  };
}

/** Streak is broken if the last goal hit was before yesterday. */
export function effectiveStreak(profile: Profile, todayISO: string, yesterdayISO: string): number {
  if (!profile.last_goal_date) return 0;
  if (profile.last_goal_date === todayISO || profile.last_goal_date === yesterdayISO) {
    return profile.streak ?? 0;
  }
  return 0;
}
