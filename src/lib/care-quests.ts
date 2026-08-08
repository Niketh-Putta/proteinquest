import type { DragonId, DragonProgress, Profile, RetentionState } from './types';

/** Fixed XP per today’s care task (task 1 / 2 / 3). */
export const CARE_STEP_XP = [25, 35, 50] as const;

function retentionOf(profile: Profile): RetentionState {
  const raw = profile.retention;
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

export type CareStep = {
  id: 'feed' | 'second' | 'half';
  label: string;
  done: boolean;
  xp: number;
};

export function getCareSteps(params: {
  dragonName: string;
  mealsToday: number;
  consumed: number;
  goal: number;
}): CareStep[] {
  const { dragonName, mealsToday, consumed, goal } = params;
  const halfGoal = goal > 0 ? Math.round(goal * 0.5) : 0;
  return [
    {
      id: 'feed',
      label: `Feed ${dragonName}`,
      done: mealsToday >= 1,
      xp: CARE_STEP_XP[0],
    },
    {
      id: 'second',
      label: 'Log a second meal',
      done: mealsToday >= 2,
      xp: CARE_STEP_XP[1],
    },
    {
      id: 'half',
      label:
        goal > 0 ? `Reach ${halfGoal}g protein (half of ${goal}g)` : 'Log a third meal',
      done: goal > 0 ? consumed >= goal * 0.5 : mealsToday >= 3,
      xp: CARE_STEP_XP[2],
    },
  ];
}

function emptySteps(): [boolean, boolean, boolean] {
  return [false, false, false];
}

function careXpState(
  retention: RetentionState,
  todayISO: string,
): { date: string; steps: [boolean, boolean, boolean] } {
  const raw = retention.care_xp;
  if (!raw || raw.date !== todayISO || !Array.isArray(raw.steps) || raw.steps.length !== 3) {
    return { date: todayISO, steps: emptySteps() };
  }
  return {
    date: todayISO,
    steps: [!!raw.steps[0], !!raw.steps[1], !!raw.steps[2]],
  };
}

function resolveDragonId(profile: Profile, todayISO: string): DragonId {
  const lockedDate =
    typeof profile.daily_dragon_date === 'string' && profile.daily_dragon_date.length >= 10
      ? profile.daily_dragon_date.slice(0, 10)
      : profile.daily_dragon_date;
  if (lockedDate === todayISO && profile.daily_dragon_id) {
    return profile.daily_dragon_id;
  }
  return profile.active_dragon_id ?? 'fire';
}

function readProgress(profile: Profile, dragonId: DragonId): DragonProgress {
  const raw = profile.dragon_progress?.[dragonId];
  if (raw && typeof raw.xp === 'number') {
    return {
      xp: Math.max(0, Math.round(raw.xp)),
      level: raw.level,
      streak: raw.streak ?? 0,
      best_streak: raw.best_streak ?? 0,
      goals_hit: raw.goals_hit ?? 0,
      last_goal_date: raw.last_goal_date ?? null,
    };
  }
  // Do not fall back to account-level profile.xp for ice/forest — that mis-attributes Ember XP.
  if (dragonId === 'fire' && typeof profile.xp === 'number') {
    return {
      xp: Math.max(0, Math.round(profile.xp)),
      level: 1,
      streak: profile.streak ?? 0,
      best_streak: profile.best_streak ?? 0,
      goals_hit: profile.goals_hit ?? 0,
      last_goal_date: profile.last_goal_date ?? null,
    };
  }
  return {
    xp: 0,
    level: 1,
    streak: 0,
    best_streak: 0,
    goals_hit: 0,
    last_goal_date: null,
  };
}

/**
 * Grant fixed XP for each care step that is newly done today.
 * Idempotent per calendar day via retention.care_xp.
 */
export function claimCareXp(params: {
  profile: Profile;
  mealsToday: number;
  consumed: number;
  goal: number;
  todayISO: string;
  dragonName: string;
  /** Injected so Node tests avoid importing react-native character.ts */
  levelForXp: (xp: number) => number;
}): {
  updates: Partial<Profile> | null;
  gained: number;
  newlyClaimed: number[];
  steps: CareStep[];
} {
  const { profile, mealsToday, consumed, goal, todayISO, dragonName, levelForXp } = params;
  const steps = getCareSteps({ dragonName, mealsToday, consumed, goal });
  const retention = retentionOf(profile);
  const claimed = careXpState(retention, todayISO);
  const nextSteps = [...claimed.steps] as [boolean, boolean, boolean];
  const newlyClaimed: number[] = [];
  let gained = 0;

  for (let i = 0; i < steps.length; i++) {
    if (steps[i].done && !nextSteps[i]) {
      nextSteps[i] = true;
      newlyClaimed.push(i);
      gained += CARE_STEP_XP[i];
    }
  }

  if (gained <= 0) {
    return { updates: null, gained: 0, newlyClaimed: [], steps };
  }

  const dragonId = resolveDragonId(profile, todayISO);
  const progress = readProgress(profile, dragonId);
  const xp = progress.xp + gained;
  const level = levelForXp(xp);
  const updatedProgress: DragonProgress = { ...progress, xp, level };

  return {
    updates: {
      dragon_progress: { ...profile.dragon_progress, [dragonId]: updatedProgress },
      xp: updatedProgress.xp,
      retention: {
        ...retention,
        care_xp: { date: todayISO, steps: nextSteps },
      },
    },
    gained,
    newlyClaimed,
    steps,
  };
}
