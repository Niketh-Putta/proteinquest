import type { ImageSourcePropType } from 'react-native';

import { canUseStreakFreeze, isoWeekKey } from './retention';
import type { DragonId, DragonProgress, Profile } from './types';

export interface DragonStage {
  index: number;
  name: string;
  /** XP level required for this visual form. */
  levelRequired: number;
  /** Approximate goals-hit threshold (reference only). */
  goalsRequired: number;
  art: ImageSourcePropType;
  tagline: string;
  /** Primary perk unlocked when this form appears. */
  perk: string;
  /** Accessory perks for levels between this form and the next evolution. */
  levelPerks: Partial<Record<number, string>>;
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

/**
 * XP levels that unlock a new visual dragon form (5 stages).
 * Front-loaded on purpose: first evolution after one solid meal, second within
 * the first few goal days — so new users feel the unique evolution loop fast.
 * Later forms stretch out to stay aspirational.
 */
export const VISUAL_EVOLUTION_LEVELS = [1, 2, 5, 12, 26] as const;

const STAGE_NAMES = ['Baby', 'Juvenile', 'Adolescent', 'Adult', 'Legendary'] as const;
const STAGE_GOALS = [0, 1, 3, 10, 24] as const;

const STAGE_TAGLINES = [
  'Just hatched. Feed me protein.',
  'Growing fast. Keep the meals coming.',
  'Getting strong. Don\u2019t skip days.',
  'Power building. Hit that goal.',
  'Legendary form. Reach your potential.',
] as const;

const STAGE_PERKS: Record<DragonId, string[]> = {
  fire: [
    'Bright curious eyes',
    'Horn nubs and ember tail',
    'Wing buds and warm scales',
    'Spread wings and blaze marks',
    'Eternal blaze - maximum majesty',
  ],
  ice: [
    'Frost-kissed eyes',
    'Crystal horn nubs and icy tail',
    'Glacier wings and ice collar',
    'Blizzard aura and crystal crown',
    'Eternal frost - absolute zero',
  ],
  forest: [
    'Leaf-bright eyes',
    'Bud horns and vine tail',
    'Branch wings and flower collar',
    'Forest aura and bloom crown',
    'Eternal grove - world tree form',
  ],
};

/** Levels between evolutions that unlock accessory text (not a new image). */
const BETWEEN_LEVEL_PERKS: Record<DragonId, Partial<Record<number, string>>> = {
  fire: {
    2: 'Tail tip glows warm orange',
    3: 'Scale shimmer intensifies',
    4: 'Smoke wisps curl from nostrils',
    6: 'Claw sparks on landing',
    7: 'Flame collar flickers brighter',
    8: 'Heat aura pulses with each meal',
    9: 'Fire horns sharpen',
    10: 'Tail flame grows longer',
    11: 'Blaze marks spread across back',
    13: 'Inferno eyes ignite',
    14: 'Ash crown forms',
    15: 'Magma veins pulse',
    16: 'Phoenix crest emerges',
    17: 'Wing span widens',
    18: 'Aura flames intensify',
    19: 'Crown horns curve upward',
    21: 'Radiant scales deepen',
    22: 'Wings cast golden shadow',
    23: 'Crown glows white-hot',
    24: 'Legendary aura stirs',
    25: 'Ancient fire runes appear',
    26: 'Wings trail stardust embers',
    27: 'Crown fully formed',
    28: 'Aura reaches peak heat',
    29: 'Final evolution imminent',
    30: 'Solar corona surrounds body',
    31: 'Wings span the full stage',
    32: 'Crown blazes eternal',
    33: 'Legendary form crystallizes',
  },
  ice: {
    2: 'Breath crystallizes in the air',
    3: 'Frost patterns deepen on scales',
    4: 'Snowflake aura drifts outward',
    6: 'Ice claws leave frost trails',
    7: 'Glacier collar gleams',
    8: 'Cold aura chills the stage',
    9: 'Crystal horns sharpen',
    10: 'Frozen tail extends',
    11: 'Aurora marks shimmer',
    13: 'Arctic eyes glow blue',
    14: 'Ice crown forms',
    15: 'Permafrost veins spread',
    16: 'Polar crest emerges',
    17: 'Wing span widens with frost',
    18: 'Blizzard aura intensifies',
    19: 'Crown crystals grow taller',
    21: 'Diamond scales harden',
    22: 'Wings cast aurora shadow',
    23: 'Crown gleams pure white',
    24: 'Legendary frost stirs',
    25: 'Ancient ice runes appear',
    26: 'Wings trail snow crystals',
    27: 'Crown fully formed',
    28: 'Aura reaches peak cold',
    29: 'Final evolution imminent',
    30: 'Polar corona surrounds body',
    31: 'Wings span the full stage',
    32: 'Crown freezes eternal',
    33: 'Legendary form crystallizes',
  },
  forest: {
    2: 'Vine tail sprouts a new leaf',
    3: 'Moss patterns deepen on scales',
    4: 'Pollen aura drifts outward',
    6: 'Root claws grip the earth',
    7: 'Flower collar blooms',
    8: 'Growth aura pulses green',
    9: 'Thorn horns sharpen',
    10: 'Root tail extends deeper',
    11: 'Growth marks spread across back',
    13: 'Emerald eyes brighten',
    14: 'Bloom crown forms',
    15: 'Bark veins spread',
    16: 'Oak crest emerges',
    17: 'Canopy wings widen',
    18: 'Forest aura intensifies',
    19: 'Crown leaves unfurl',
    21: 'Living scales deepen green',
    22: 'Wings cast dappled shadow',
    23: 'Crown blooms fully',
    24: 'Legendary grove stirs',
    25: 'Ancient root runes appear',
    26: 'Wings trail pollen spores',
    27: 'Crown fully formed',
    28: 'Aura reaches peak growth',
    29: 'Final evolution imminent',
    30: 'Solar canopy surrounds body',
    31: 'Wings span the full stage',
    32: 'Crown grows eternal',
    33: 'Legendary form crystallizes',
  },
};

type ArtLoader = () => ImageSourcePropType;

const DRAGON_ART_LOADERS: Record<DragonId, ArtLoader[]> = {
  fire: [
    () => require('@/assets/character/dragons/fire-1.png'),
    () => require('@/assets/character/dragons/fire-2.png'),
    () => require('@/assets/character/dragons/fire-3.png'),
    () => require('@/assets/character/dragons/fire-4.png'),
    () => require('@/assets/character/dragons/fire-5.png'),
  ],
  ice: [
    () => require('@/assets/character/dragons/ice-1.png'),
    () => require('@/assets/character/dragons/ice-2.png'),
    () => require('@/assets/character/dragons/ice-3.png'),
    () => require('@/assets/character/dragons/ice-4.png'),
    () => require('@/assets/character/dragons/ice-5.png'),
  ],
  forest: [
    () => require('@/assets/character/dragons/forest-1.png'),
    () => require('@/assets/character/dragons/forest-2.png'),
    () => require('@/assets/character/dragons/forest-3.png'),
    () => require('@/assets/character/dragons/forest-4.png'),
    () => require('@/assets/character/dragons/forest-5.png'),
  ],
};

/** Eager-loaded baby forms only — used by DailyDragonPicker previews. */
const PREVIEW_ART: Record<DragonId, ImageSourcePropType> = {
  fire: require('@/assets/character/dragons/fire-1.png'),
  ice: require('@/assets/character/dragons/ice-1.png'),
  forest: require('@/assets/character/dragons/forest-1.png'),
};

const artCache: Partial<Record<DragonId, ImageSourcePropType[]>> = {};

export function getDragonArt(dragonId: DragonId, stageIndex: number): ImageSourcePropType {
  if (!artCache[dragonId]) {
    artCache[dragonId] = DRAGON_ART_LOADERS[dragonId].map((load) => load());
  }
  return artCache[dragonId]![stageIndex];
}

function buildStages(id: DragonId): DragonStage[] {
  return STAGE_NAMES.map((name, index) => {
    const stage = {
      index,
      name,
      levelRequired: VISUAL_EVOLUTION_LEVELS[index],
      goalsRequired: STAGE_GOALS[index],
      tagline: STAGE_TAGLINES[index],
      perk: STAGE_PERKS[id][index],
      levelPerks: BETWEEN_LEVEL_PERKS[id],
    } as DragonStage;
    Object.defineProperty(stage, 'art', {
      get() {
        return getDragonArt(id, index);
      },
      enumerable: true,
      configurable: true,
    });
    return stage;
  });
}

export const DRAGONS: DragonType[] = [
  {
    id: 'fire',
    name: 'Ember',
    title: 'Fire Dragon',
    element: 'Fire',
    accent: '#FF6B3D',
    previewArt: PREVIEW_ART.fire,
    stages: buildStages('fire'),
    motto: 'Burn bright. Eat protein.',
  },
  {
    id: 'ice',
    name: 'Frost',
    title: 'Ice Dragon',
    element: 'Ice',
    accent: '#5BC8F5',
    previewArt: PREVIEW_ART.ice,
    stages: buildStages('ice'),
    motto: 'Stay cool. Stay consistent.',
  },
  {
    id: 'forest',
    name: 'Moss',
    title: 'Forest Dragon',
    element: 'Forest',
    accent: '#5AD67A',
    previewArt: PREVIEW_ART.forest,
    stages: buildStages('forest'),
    motto: 'Grow roots. Grow muscle.',
  },
];

/** Cumulative XP thresholds per level (index 0 = level 1). Early levels are cheap. */
const LEVEL_XP_THRESHOLDS: number[] = (() => {
  const thresholds = [0];
  let increment = 40;
  for (let level = 2; level <= 45; level++) {
    const isEvolution = (VISUAL_EVOLUTION_LEVELS as readonly number[]).includes(level);
    if (level <= 6) {
      // New-user ramp: frequent level-ups + early evolutions.
      increment += isEvolution ? 18 : Math.round(6 + level * 1.2);
    } else if (isEvolution) {
      increment += 55;
    } else {
      increment += Math.round(18 + level * 2.2);
    }
    thresholds.push(thresholds[thresholds.length - 1] + increment);
  }
  return thresholds;
})();

export function dragonById(id: DragonId | null | undefined): DragonType {
  return DRAGONS.find((d) => d.id === id) ?? DRAGONS[0];
}

export const MAX_DRAGON_NAME_LEN = 24;

export function normalizeDragonName(raw: string): string {
  return raw.trim().slice(0, MAX_DRAGON_NAME_LEN);
}

/** Custom dragon name from profile or in-memory overrides, else default species name. */
export function displayDragonName(
  profile: Profile | null | undefined,
  dragonId: DragonId,
  overrides?: Partial<Record<DragonId, string>>,
): string {
  const custom = overrides?.[dragonId] ?? profile?.dragon_names?.[dragonId];
  if (custom?.trim()) return custom.trim();
  return dragonById(dragonId).name;
}

export function buildDragonNames(
  input: Partial<Record<DragonId, string>>,
): Partial<Record<DragonId, string>> {
  const result: Partial<Record<DragonId, string>> = {};
  for (const d of DRAGONS) {
    const name = normalizeDragonName(input[d.id] ?? '');
    if (name) result[d.id] = name;
  }
  return result;
}

export const XP_PER_GRAM = 1;
export const XP_GOAL_BONUS = 100;

export function emptyDragonProgress(): DragonProgress {
  return { xp: 0, level: 1, streak: 0, best_streak: 0, goals_hit: 0, last_goal_date: null };
}

export function xpForLevel(level: number): number {
  const idx = Math.max(0, Math.min(level - 1, LEVEL_XP_THRESHOLDS.length - 1));
  return LEVEL_XP_THRESHOLDS[idx];
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export function xpToNextLevel(level: number): number {
  if (level >= LEVEL_XP_THRESHOLDS.length) return 0;
  return LEVEL_XP_THRESHOLDS[level] - LEVEL_XP_THRESHOLDS[level - 1];
}

export function xpProgressInLevel(xp: number, level: number): number {
  const current = xpForLevel(level);
  const next = level < LEVEL_XP_THRESHOLDS.length ? xpForLevel(level + 1) : current;
  if (next <= current) return 1;
  return Math.min((xp - current) / (next - current), 1);
}

export function effectiveLevel(progress: DragonProgress): number {
  return levelForXp(progress.xp);
}

/** XP progress within the dragon's current level (per-dragon, not account total). */
export function dragonLevelProgress(progress: DragonProgress): {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
} {
  const level = effectiveLevel(progress);
  const floor = xpForLevel(level);
  return {
    level,
    xpIntoLevel: Math.max(progress.xp - floor, 0),
    xpForNext: Math.max(xpToNextLevel(level), 0),
  };
}

export function getDragonProgress(profile: Profile, dragonId: DragonId): DragonProgress {
  const stored = profile.dragon_progress?.[dragonId];
  if (stored) {
    const merged = { ...emptyDragonProgress(), ...stored };
    return { ...merged, level: merged.level ?? levelForXp(merged.xp) };
  }
  if (dragonId === 'fire' && !profile.dragon_progress?.fire) {
    const xp = profile.xp ?? 0;
    return {
      xp,
      level: levelForXp(xp),
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

export function isDailyDragonLockedForToday(profile: Profile, todayISO: string): boolean {
  return profile.daily_dragon_date === todayISO && profile.daily_dragon_id != null;
}

export function todayDragonId(profile: Profile, todayISO: string): DragonId | null {
  if (isDailyDragonLockedForToday(profile, todayISO)) {
    return profile.daily_dragon_id!;
  }
  return null;
}

export function displayDragonId(profile: Profile, todayISO: string): DragonId {
  return todayDragonId(profile, todayISO) ?? activeDragonId(profile);
}

export function displayProgress(profile: Profile, todayISO: string): DragonProgress {
  return getDragonProgress(profile, displayDragonId(profile, todayISO));
}

export function activeProgress(profile: Profile): DragonProgress {
  return getDragonProgress(profile, activeDragonId(profile));
}

export function lockDailyDragon(
  profile: Profile,
  dragonId: DragonId,
  todayISO: string,
): Partial<Profile> {
  const switched = switchActiveDragon(profile, dragonId);
  return {
    ...switched,
    daily_dragon_id: dragonId,
    daily_dragon_date: todayISO,
  };
}

export function stageForXpLevel(level: number, dragonId: DragonId): DragonStage {
  const stages = dragonById(dragonId).stages;
  let stage = stages[0];
  for (const s of stages) {
    if (level >= s.levelRequired) stage = s;
  }
  return stage;
}

export function nextEvolutionStage(level: number, dragonId: DragonId): DragonStage | null {
  return dragonById(dragonId).stages.find((s) => s.levelRequired > level) ?? null;
}

export function isEvolutionLevel(level: number): boolean {
  return (VISUAL_EVOLUTION_LEVELS as readonly number[]).includes(level);
}

export function perkForLevel(level: number, dragonId: DragonId): string | null {
  if (isEvolutionLevel(level)) {
    return stageForXpLevel(level, dragonId).perk;
  }
  return BETWEEN_LEVEL_PERKS[dragonId][level] ?? null;
}

/** Visual growth within the current stage (0 = just evolved, 1 = about to evolve). */
export interface MicroProgress {
  progress: number;
  scale: number;
  scaleY: number;
  translateY: number;
  glowOpacity: number;
}

export function microProgress(level: number, dragonId: DragonId): MicroProgress {
  const stage = stageForXpLevel(level, dragonId);
  const next = nextEvolutionStage(level, dragonId);
  if (!next) {
    return { progress: 1, scale: 1.06, scaleY: 1.08, translateY: -4, glowOpacity: 0.28 };
  }
  const span = next.levelRequired - stage.levelRequired;
  const progress = span <= 1 ? 0 : Math.min((level - stage.levelRequired) / span, 1);
  return {
    progress,
    scale: 1 + progress * 0.06,
    scaleY: 1 + progress * 0.08,
    translateY: -progress * 4,
    glowOpacity: 0.12 + progress * 0.16,
  };
}

/** @deprecated Use stageForXpLevel with effectiveLevel(progress). */
export function stageForGoalsHit(goalsHit: number, dragonId: DragonId): DragonStage {
  const stages = dragonById(dragonId).stages;
  let stage = stages[0];
  for (const s of stages) {
    if (goalsHit >= s.goalsRequired) stage = s;
  }
  return stage;
}

/** @deprecated Use nextEvolutionStage with effectiveLevel(progress). */
export function nextStage(goalsHit: number, dragonId: DragonId): DragonStage | null {
  return dragonById(dragonId).stages.find((s) => s.goalsRequired > goalsHit) ?? null;
}

function dayBeforeISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function effectiveStreak(
  progress: DragonProgress,
  todayISO: string,
  yesterdayISO: string,
  opts?: { freezeKeepsAlive?: boolean },
): number {
  if (!progress.last_goal_date) return 0;
  if (progress.last_goal_date === todayISO || progress.last_goal_date === yesterdayISO) {
    return progress.streak ?? 0;
  }
  // Pro streak freeze: still show streak if last goal was the day before yesterday.
  if (
    opts?.freezeKeepsAlive &&
    progress.last_goal_date === dayBeforeISO(yesterdayISO)
  ) {
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
  leveledUp: boolean;
  perkUnlocked: string | null;
  stageBeforeIndex: number;
  stageAfterIndex: number;
  levelBefore: number;
  levelAfter: number;
  dragonId: DragonId;
  streakFreezeUsed: boolean;
} {
  const { profile, todayTotalBefore, loggedProtein, todayISO, yesterdayISO } = params;
  const dragonId = todayDragonId(profile, todayISO) ?? activeDragonId(profile);
  const progress = getDragonProgress(profile, dragonId);
  const goal = profile.protein_goal_g ?? 0;
  const totalAfter = todayTotalBefore + loggedProtein;

  let xp = progress.xp + Math.round(loggedProtein * XP_PER_GRAM);
  let streak = progress.streak;
  let bestStreak = progress.best_streak;
  let goalsHit = progress.goals_hit;
  let lastGoalDate = progress.last_goal_date;
  let streakFreezeUsed = false;
  let retention = { ...(profile.retention ?? {}) };

  const levelBefore = effectiveLevel(progress);
  const stageBefore = stageForXpLevel(levelBefore, dragonId).index;

  const alreadyHitToday = lastGoalDate === todayISO;
  const goalJustHit = goal > 0 && !alreadyHitToday && totalAfter >= goal;

  if (goalJustHit) {
    xp += XP_GOAL_BONUS;
    goalsHit += 1;
    const dayBeforeYesterday = dayBeforeISO(yesterdayISO);
    if (lastGoalDate === yesterdayISO) {
      streak = streak + 1;
    } else if (lastGoalDate === dayBeforeYesterday && canUseStreakFreeze(profile)) {
      streak = streak + 1;
      streakFreezeUsed = true;
      retention = { ...retention, streak_freeze_week: isoWeekKey() };
    } else {
      streak = 1;
    }
    bestStreak = Math.max(bestStreak, streak);
    lastGoalDate = todayISO;
  }

  const levelAfter = levelForXp(xp);
  const stageAfterIndex = stageForXpLevel(levelAfter, dragonId).index;
  const evolved = stageAfterIndex > stageBefore;
  const leveledUp = levelAfter > levelBefore;
  const perkUnlocked = leveledUp ? perkForLevel(levelAfter, dragonId) : null;

  const updatedProgress: DragonProgress = {
    xp,
    level: levelAfter,
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
      ...(streakFreezeUsed ? { retention } : {}),
    },
    goalJustHit,
    evolved,
    leveledUp,
    perkUnlocked,
    stageBeforeIndex: stageBefore,
    stageAfterIndex,
    levelBefore,
    levelAfter,
    dragonId,
    streakFreezeUsed,
  };
}

export function applyDeleteLogToCharacter(params: {
  profile: Profile;
  deletedProteinG: number;
  todayTotalAfterDelete: number;
  todayISO: string;
}): Partial<Profile> {
  const { profile, deletedProteinG, todayTotalAfterDelete, todayISO } = params;
  const dragonId = todayDragonId(profile, todayISO) ?? activeDragonId(profile);
  const progress = getDragonProgress(profile, dragonId);
  const goal = profile.protein_goal_g ?? 0;

  let xp = Math.max(0, progress.xp - Math.round(deletedProteinG));
  let goalsHit = progress.goals_hit;
  let streak = progress.streak;
  let lastGoalDate = progress.last_goal_date;

  const wasGoalHitToday = lastGoalDate === todayISO;
  const stillHitsGoal = goal > 0 && todayTotalAfterDelete >= goal;

  if (wasGoalHitToday && !stillHitsGoal) {
    xp = Math.max(0, xp - XP_GOAL_BONUS);
    goalsHit = Math.max(0, goalsHit - 1);
    lastGoalDate = null;
    streak = Math.max(0, streak - 1);
  }

  const updatedProgress: DragonProgress = {
    ...progress,
    xp,
    level: levelForXp(xp),
    goals_hit: goalsHit,
    streak,
    last_goal_date: lastGoalDate,
  };

  return {
    dragon_progress: { ...profile.dragon_progress, [dragonId]: updatedProgress },
    xp: updatedProgress.xp,
    streak: updatedProgress.streak,
    best_streak: updatedProgress.best_streak,
    goals_hit: updatedProgress.goals_hit,
    last_goal_date: updatedProgress.last_goal_date,
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

/** Reference table for docs / UI - level → cumulative XP threshold. */
export function levelThresholdTable(maxLevel = 40): { level: number; xp: number; evolves: boolean }[] {
  return Array.from({ length: maxLevel }, (_, i) => {
    const level = i + 1;
    return {
      level,
      xp: xpForLevel(level),
      evolves: isEvolutionLevel(level),
    };
  });
}
