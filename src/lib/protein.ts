import type { ActivityLevel, GoalType } from './types';

// Grams of protein per kg of bodyweight, by training volume.
const ACTIVITY_G_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 0.9,
  light: 1.1,
  moderate: 1.4,
  active: 1.6,
  athlete: 1.9,
};

const GOAL_BONUS_G_PER_KG: Record<GoalType, number> = {
  maintain: 0,
  build_muscle: 0.4,
  lose_fat: 0.3, // higher protein preserves muscle in a deficit
};

export function calculateProteinGoal(params: {
  weightKg: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}): number {
  const { weightKg, age, activityLevel, goalType } = params;
  let gPerKg = ACTIVITY_G_PER_KG[activityLevel] + GOAL_BONUS_G_PER_KG[goalType];
  // Older adults need more protein to counter anabolic resistance.
  if (age >= 50) gPerKg += 0.2;
  gPerKg = Math.min(gPerKg, 2.2);
  const goal = weightKg * gPerKg;
  return Math.max(50, Math.round(goal / 5) * 5);
}

export const ACTIVITY_LABELS: Record<ActivityLevel, { title: string; subtitle: string }> = {
  sedentary: { title: 'Sedentary', subtitle: 'Little to no exercise' },
  light: { title: 'Light', subtitle: '1\u20132 workouts / week' },
  moderate: { title: 'Moderate', subtitle: '3\u20134 workouts / week' },
  active: { title: 'Active', subtitle: '5\u20136 workouts / week' },
  athlete: { title: 'Athlete', subtitle: 'Daily intense training' },
};

export const GOAL_LABELS: Record<GoalType, { title: string; subtitle: string }> = {
  build_muscle: { title: 'Build muscle', subtitle: 'Maximize growth' },
  lose_fat: { title: 'Lose fat', subtitle: 'Keep muscle in a cut' },
  maintain: { title: 'Maintain', subtitle: 'Stay where I am' },
};

export function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
