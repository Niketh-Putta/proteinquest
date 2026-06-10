import type { ActivityLevel, GoalType, Sex } from './types';

export const KG_PER_LB = 0.45359237;

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

export function todayISODate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
