import type { ActivityLevel, GoalType, Profile, Sex } from './types';
import { getRetention } from './retention';

export const KG_PER_LB = 0.45359237;

// Must match the `profiles` table check constraints
// (age between 10 and 120, weight_kg between 25 and 350).
export const AGE_MIN = 10;
export const AGE_MAX = 120;
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 350;

// Evidence-based g/kg baselines by training volume (ISSN / Morton et al. meta-analysis ranges).
const ACTIVITY_G_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 0.9, // RDA 0.8 + small buffer
  light: 1.2, // recreationally active, 1-2 sessions/week
  moderate: 1.5, // 3-4 sessions/week
  active: 1.8, // strength training 5-6x/week
  athlete: 2.0, // daily intense training
};

// Goal adjustments on top of the activity baseline.
const GOAL_DELTA_G_PER_KG: Record<GoalType, number> = {
  maintain: 0,
  build_muscle: 0.2, // push toward the top of the hypertrophy range
  lose_fat: 0.4, // higher intake preserves lean mass in a deficit (2.3-3.1 g/kg FFM evidence)
};

const SENIOR_BONUS_G_PER_KG = 0.2; // 50+: anabolic resistance
const SENIOR_MIN_G_PER_KG = 1.2; // floor for older adults (PROT-AGE)
const FEMALE_ADJUST = -0.05; // slightly lower average lean-mass fraction
const MAX_G_PER_KG = 3.0;
const MAX_GRAMS = 250;
const MIN_GRAMS = 45;

export interface GoalCalculation {
  grams: number;
  gPerKg: number;
  reasoning: string[];
}

export function calculateProteinGoal(params: {
  weightKg: number;
  age: number;
  sex: Sex | null;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}): GoalCalculation {
  const { weightKg, age, sex, activityLevel, goalType } = params;
  const reasoning: string[] = [];

  let gPerKg = ACTIVITY_G_PER_KG[activityLevel];
  reasoning.push(
    `${gPerKg.toFixed(1)} g/kg baseline - ${ACTIVITY_LABELS[activityLevel].why}`,
  );

  const goalDelta = GOAL_DELTA_G_PER_KG[goalType];
  if (goalDelta !== 0) {
    gPerKg += goalDelta;
    reasoning.push(
      `+${goalDelta.toFixed(1)} g/kg - ${GOAL_LABELS[goalType].why}`,
    );
  }

  if (age >= 50) {
    gPerKg += SENIOR_BONUS_G_PER_KG;
    reasoning.push(
      `+${SENIOR_BONUS_G_PER_KG.toFixed(1)} g/kg - at ${age}, muscle responds less to protein (anabolic resistance), so you need more`,
    );
    if (gPerKg < SENIOR_MIN_G_PER_KG) gPerKg = SENIOR_MIN_G_PER_KG;
  }

  if (sex === 'female') {
    gPerKg += FEMALE_ADJUST;
    reasoning.push(`\u22120.05 g/kg - adjusted for average body composition`);
  }

  if (gPerKg > MAX_G_PER_KG) {
    gPerKg = MAX_G_PER_KG;
    reasoning.push(`capped at ${MAX_G_PER_KG.toFixed(1)} g/kg - no benefit shown beyond this`);
  }

  let grams = Math.round(weightKg * gPerKg);
  if (grams > MAX_GRAMS) {
    grams = MAX_GRAMS;
    reasoning.push(`capped at ${MAX_GRAMS}g/day - practical upper limit`);
  }
  if (grams < MIN_GRAMS) grams = MIN_GRAMS;

  return { grams, gPerKg: Math.round(gPerKg * 100) / 100, reasoning };
}

export const ACTIVITY_LABELS: Record<
  ActivityLevel,
  { title: string; subtitle: string; why: string }
> = {
  sedentary: {
    title: 'Sedentary',
    subtitle: 'Little to no exercise',
    why: 'minimal training, close to the RDA',
  },
  light: {
    title: 'Lightly active',
    subtitle: '1\u20132 workouts / week',
    why: 'recreationally active',
  },
  moderate: {
    title: 'Moderate',
    subtitle: '3\u20134 workouts / week',
    why: 'regular training needs elevated intake',
  },
  active: {
    title: 'Strength training',
    subtitle: '5\u20136 sessions / week',
    why: 'serious lifting volume (Morton et al. optimal range)',
  },
  athlete: {
    title: 'Athlete',
    subtitle: 'Daily intense training',
    why: 'top of the evidence-based range for daily training',
  },
};

export const GOAL_LABELS: Record<GoalType, { title: string; subtitle: string; why: string }> = {
  build_muscle: {
    title: 'Build muscle',
    subtitle: 'Maximize growth',
    why: 'building muscle pushes you to the top of the hypertrophy range',
  },
  lose_fat: {
    title: 'Lose fat',
    subtitle: 'Keep muscle in a deficit',
    why: 'extra protein protects lean mass while cutting',
  },
  maintain: {
    title: 'Maintain',
    subtitle: 'Stay where I am',
    why: 'maintenance baseline',
  },
};

export function kgFromInput(value: number, unit: 'kg' | 'lbs'): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

/**
 * Approximate daily calorie aim from onboarding fields (no height).
 * TDEE-style: kcal/kg by training volume, then goal surplus/deficit.
 * Moderate (~34 kcal/kg) lands near a typical maintenance estimate.
 */
const ACTIVITY_KCAL_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 28,
  light: 31,
  moderate: 34,
  active: 37,
  athlete: 40,
};

const GOAL_KCAL_DELTA: Record<GoalType, number> = {
  maintain: 0,
  build_muscle: 250,
  lose_fat: -400,
};

export const DEFAULT_CALORIE_AIM = 2000;
export const CALORIE_AIM_MIN = 1000;
export const CALORIE_AIM_MAX = 5000;

export interface CalorieCalculation {
  kcal: number;
  kcalPerKg: number;
  reasoning: string[];
}

export function calculateCalorieAim(params: {
  weightKg: number;
  sex: Sex | null;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}): CalorieCalculation {
  const { weightKg, sex, activityLevel, goalType } = params;
  const reasoning: string[] = [];
  const basePerKg = ACTIVITY_KCAL_PER_KG[activityLevel];
  let kcal = weightKg * basePerKg;
  reasoning.push(
    `${basePerKg} kcal/kg · ${ACTIVITY_LABELS[activityLevel].title.toLowerCase()} training volume`,
  );

  if (sex === 'female') {
    kcal *= 0.9;
    reasoning.push('×0.9 · adjusted for average female energy needs');
  }

  const goalDelta = GOAL_KCAL_DELTA[goalType];
  if (goalDelta > 0) {
    kcal += goalDelta;
    reasoning.push(`+${goalDelta} kcal · surplus for building muscle`);
  } else if (goalDelta < 0) {
    kcal += goalDelta;
    reasoning.push(`${goalDelta} kcal · deficit to lose fat while keeping protein high`);
  } else {
    reasoning.push('maintenance calories · no surplus or deficit');
  }

  const rounded = Math.round(Math.min(CALORIE_AIM_MAX, Math.max(CALORIE_AIM_MIN, kcal)));
  if (rounded !== Math.round(kcal)) {
    reasoning.push(`clamped to ${rounded} kcal · practical daily range`);
  }

  return {
    kcal: rounded,
    kcalPerKg: Math.round((rounded / weightKg) * 10) / 10,
    reasoning,
  };
}

/** Stored override in retention, else derived from profile, else 2000. */
export function resolveCalorieAim(profile: Profile | null | undefined): number {
  const stored = getRetention(profile).calorie_goal_kcal;
  if (
    typeof stored === 'number' &&
    Number.isFinite(stored) &&
    stored >= CALORIE_AIM_MIN &&
    stored <= CALORIE_AIM_MAX
  ) {
    return Math.round(stored);
  }
  const weightKg = profile?.weight_kg;
  const activity = profile?.activity_level;
  const goalType = profile?.goal_type;
  if (
    typeof weightKg === 'number' &&
    weightKg >= WEIGHT_KG_MIN &&
    weightKg <= WEIGHT_KG_MAX &&
    activity &&
    goalType
  ) {
    return calculateCalorieAim({
      weightKg,
      sex: profile?.sex ?? null,
      activityLevel: activity,
      goalType,
    }).kcal;
  }
  return DEFAULT_CALORIE_AIM;
}

export function todayISODate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
