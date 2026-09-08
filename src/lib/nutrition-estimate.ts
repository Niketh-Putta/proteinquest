/** Starting estimates for adults, not a prediction of weight-loss speed.
 * Protein: ISSN position stand https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
 * Energy: Mifflin–St Jeor resting estimate with an activity multiplier.
 */
export type NutritionEstimateInput = {
  age: number;
  heightCm: number;
  weightKg: number;
  targetKg: number;
  sex: string;
  activity: string;
  goal: string;
  pace: number;
};

export type NutritionEstimateResult = {
  calories: number;
  protein: number;
  reasoning: string[];
};

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: 'sedentary',
  light: 'light activity',
  moderate: 'moderate training',
  active: 'high training volume',
  athlete: 'athlete / daily training',
};

export function nutritionEstimate(p: NutritionEstimateInput): NutritionEstimateResult {
  if (
    ![p.age, p.heightCm, p.weightKg, p.targetKg, p.pace].every(Number.isFinite) ||
    p.age < 18 ||
    p.age > 120 ||
    p.heightCm < 100 ||
    p.heightCm > 250 ||
    p.weightKg < 25 ||
    p.weightKg > 350 ||
    p.targetKg < 25 ||
    p.targetKg > 350 ||
    p.pace < 0 ||
    p.pace > 1
  ) {
    throw new Error('Check your age, height, weights and weekly pace. Adult estimates only.');
  }

  const sexKey = p.sex === 'female' || p.sex === 'male' ? p.sex : 'other';
  const sexOffset = sexKey === 'female' ? -161 : sexKey === 'male' ? 5 : -78;
  const factor = ACTIVITY_FACTORS[p.activity] || 1.375;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + sexOffset;
  const maintenance = bmr * factor;
  const reached =
    (p.goal === 'lose_fat' && p.weightKg <= p.targetKg) ||
    (p.goal === 'build_muscle' && p.weightKg >= p.targetKg);
  // Bound the initial adjustment; the static energy conversion is not a timeline guarantee.
  const adjustment = reached
    ? 0
    : p.goal === 'lose_fat'
      ? -Math.min(500, maintenance * 0.2, p.pace * 1100)
      : p.goal === 'build_muscle'
        ? Math.min(300, maintenance * 0.15, p.pace * 1100)
        : 0;
  const floor = sexKey === 'female' ? 1200 : 1500;
  const calories = Math.round(Math.max(floor, maintenance + adjustment) / 10) * 10;
  const multiplier = p.activity === 'sedentary' ? 1.2 : p.goal === 'lose_fat' ? 2 : 1.6;
  const protein = Math.round(Math.min(250, Math.max(45, p.weightKg * multiplier)));

  const reasoning: string[] = [
    `Mifflin–St Jeor BMR ≈ ${Math.round(bmr)} kcal using age, height, weight and sex`,
    `×${factor} for ${ACTIVITY_LABEL[p.activity] || 'light activity'} → ~${Math.round(maintenance)} kcal maintenance`,
  ];
  if (adjustment < 0) {
    reasoning.push(
      `${adjustment} kcal paced deficit from your weekly goal (capped for safety)`,
    );
  } else if (adjustment > 0) {
    reasoning.push(
      `+${adjustment} kcal paced surplus from your weekly goal (capped for safety)`,
    );
  } else {
    reasoning.push('Maintenance calories · target already matches your goal');
  }
  reasoning.push(
    `Protein ${protein}g · ${multiplier} g/kg (${p.goal === 'lose_fat' ? 'higher to protect lean mass' : p.activity === 'sedentary' ? 'sedentary baseline' : 'training baseline'})`,
  );
  reasoning.push('Starting estimate only · adjust with your progress');

  return { calories, protein, reasoning };
}
