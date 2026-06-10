import type { ImageSourcePropType } from 'react-native';

import type { DragonId, DragonProgress, Profile } from './types';

export interface DragonStage {
  index: number;
  name: string;
  goalsRequired: number;
  art: ImageSourcePropType;
  tagline: string;
}

export interface DragonType {
  id: DragonId;
  name: string;
  title: string;
  element: string;
  accent: string;
  previewArt: ImageSourcePropType;
  stages: DragonStage[];
  motto: string;
}

const ART: Record<DragonId, ImageSourcePropType[]> = {
  fire: [
    require('@/assets/character/dragons/fire-1.png'),
    require('@/assets/character/dragons/fire-2.png'),
    require('@/assets/character/dragons/fire-3.png'),
    require('@/assets/character/dragons/fire-4.png'),
    require('@/assets/character/dragons/fire-5.png'),
  ],
  ice: [
    require('@/assets/character/dragons/ice-1.png'),
    require('@/assets/character/dragons/ice-2.png'),
    require('@/assets/character/dragons/ice-3.png'),
    require('@/assets/character/dragons/ice-4.png'),
    require('@/assets/character/dragons/ice-5.png'),
  ],
  forest: [
    require('@/assets/character/dragons/forest-1.png'),
    require('@/assets/character/dragons/forest-2.png'),
    require('@/assets/character/dragons/forest-3.png'),
    require('@/assets/character/dragons/forest-4.png'),
    require('@/assets/character/dragons/forest-5.png'),
  ],
};

const STAGE_NAMES = ['Baby', 'Juvenile', 'Adolescent', 'Adult', 'Legendary'] as const;
const STAGE_GOALS = [0, 2, 7, 14, 30];
const STAGE_TAGLINES = [
  'Just hatched. Feed me protein.',
  'Growing fast. Keep the meals coming.',
  'Getting strong. Don\u2019t skip days.',
  'Power building. Hit that goal.',
  'Legendary form. Reach your potential.',
];

function buildStages(id: DragonId): DragonStage[] {
  return STAGE_NAMES.map((name, index) => ({
    index,
    name,
    goalsRequired: STAGE_GOALS[index],
    art: ART[id][index],
    tagline: STAGE_TAGLINES[index],
  }));
}

export const DRAGONS: DragonType[] = [
  {
    id: 'fire',
    name: 'Ember',
    title: 'Fire Dragon',
    element: 'Fire',
    accent: '#FF6B3D',
    previewArt: ART.fire[0],
    stages: buildStages('fire'),
    motto: 'Burn bright. Eat protein.',
  },
  {
    id: 'ice',
    name: 'Frost',
    title: 'Ice Dragon',
    element: 'Ice',
    accent: '#5BC8F5',
    previewArt: ART.ice[0],
    stages: buildStages('ice'),
    motto: 'Stay cool. Stay consistent.',
  },
  {
    id: 'forest',
    name: 'Moss',
    title: 'Forest Dragon',
    element: 'Forest',
    accent: '#5AD67A',
    previewArt: ART.forest[0],
    stages: buildStages('forest'),
    motto: 'Grow roots. Grow muscle.',
  },
];

export function dragonById(id: DragonId | null | undefined): DragonType {
  return DRAGONS.find((d) => d.id === id) ?? DRAGONS[0];
}

export const XP_PER_GRAM = 1;
export const XP_GOAL_BONUS = 100;

export function emptyDragonProgress(): DragonProgress {
  return { xp: 0, streak: 0, best_streak: 0, goals_hit: 0, last_goal_date: null };
}

export function getDragonProgress(profile: Profile, dragonId: DragonId): DragonProgress {
  const stored = profile.dragon_progress?.[dragonId];
  if (stored) return { ...emptyDragonProgress(), ...stored };
  if (dragonId === 'fire' && !profile.dragon_progress?.fire) {
    return {
      xp: profile.xp ?? 0,
      streak: profile.streak ?? 0,
      best_streak: profile.best_streak ?? 0,
      goals_hit: profile.goals_hit ?? 0,
      last_goal_date: profile.last_goal_date,
    };
  }
  return emptyDragonProgress();
}

export function activeDragonId(profile: Profile): DragonId {
  return profile.active_dragon_id ?? 'fire';
}

export function activeProgress(profile: Profile): DragonProgress {
  return getDragonProgress(profile, activeDragonId(profile));
}

export function stageForGoalsHit(goalsHit: number, dragonId: DragonId): DragonStage {
  const stages = dragonById(dragonId).stages;
  let stage = stages[0];
  for (const s of stages) {
    if (goalsHit >= s.goalsRequired) stage = s;
  }
  return stage;
}

export function nextStage(goalsHit: number, dragonId: DragonId): DragonStage | null {
  return dragonById(dragonId).stages.find((s) => s.goalsRequired > goalsHit) ?? null;
}

export function effectiveStreak(
  progress: DragonProgress,
  todayISO: string,
  yesterdayISO: string,
): number {
  if (!progress.last_goal_date) return 0;
  if (progress.last_goal_date === todayISO || progress.last_goal_date === yesterdayISO) {
    return progress.streak ?? 0;
  }
  return 0;
}

export function applyLogToCharacter(params: {
  profile: Profile;
  todayTotalBefore: number;
  loggedProtein: number;
  todayISO: string;
  yesterdayISO: string;
}): {
  updates: Partial<Profile>;
  goalJustHit: boolean;
  evolved: boolean;
  dragonId: DragonId;
} {
  const { profile, todayTotalBefore, loggedProtein, todayISO, yesterdayISO } = params;
  const dragonId = activeDragonId(profile);
  const progress = getDragonProgress(profile, dragonId);
  const goal = profile.protein_goal_g ?? 0;
  const totalAfter = todayTotalBefore + loggedProtein;

  let xp = progress.xp + Math.round(loggedProtein * XP_PER_GRAM);
  let streak = progress.streak;
  let bestStreak = progress.best_streak;
  let goalsHit = progress.goals_hit;
  let lastGoalDate = progress.last_goal_date;

  const alreadyHitToday = lastGoalDate === todayISO;
  const goalJustHit = goal > 0 && !alreadyHitToday && totalAfter >= goal;
  const stageBefore = stageForGoalsHit(goalsHit, dragonId).index;

  if (goalJustHit) {
    xp += XP_GOAL_BONUS;
    goalsHit += 1;
    streak = lastGoalDate === yesterdayISO ? streak + 1 : 1;
    bestStreak = Math.max(bestStreak, streak);
    lastGoalDate = todayISO;
  }

  const evolved = stageForGoalsHit(goalsHit, dragonId).index > stageBefore;
  const updatedProgress: DragonProgress = {
    xp,
    streak,
    best_streak: bestStreak,
    goals_hit: goalsHit,
    last_goal_date: lastGoalDate,
  };

  return {
    updates: {
      dragon_progress: { ...profile.dragon_progress, [dragonId]: updatedProgress },
      xp: updatedProgress.xp,
      streak: updatedProgress.streak,
      best_streak: updatedProgress.best_streak,
      goals_hit: updatedProgress.goals_hit,
      last_goal_date: updatedProgress.last_goal_date,
    },
    goalJustHit,
    evolved,
    dragonId,
  };
}

export function switchActiveDragon(profile: Profile, newId: DragonId): Partial<Profile> {
  const existing = getDragonProgress(profile, newId);
  return {
    active_dragon_id: newId,
    xp: existing.xp,
    streak: existing.streak,
    best_streak: existing.best_streak,
    goals_hit: existing.goals_hit,
    last_goal_date: existing.last_goal_date,
  };
}
