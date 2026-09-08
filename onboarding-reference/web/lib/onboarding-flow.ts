import { nutritionEstimate } from './nutrition-estimate';
export const KG_TO_LB = 2.2046226218;

export function isAdult(birthday: string, now = new Date()) {
  const [year, month, day] = birthday.split('-').map(Number);
  const birth = new Date(year, month - 1, day);
  if (!year || birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return false;
  const age = now.getFullYear() - year - (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day) ? 1 : 0);
  return age >= 18;
}

export function nextStep(step: number, goal: string) {
  if (step === 19 || step === 20 || step === 21) return 22;
  if (step === 22 || step === 23) return 24;
  return step === 10 && goal === 'Maintain' ? 14 : Math.min(34, step + 1);
}

export function suggestedTarget(weight: number, goal: string) {
  return goal === 'Maintain' ? weight : goal === 'Lose weight' ? Math.max(1, weight - 5) : Math.min(400, weight + 1.9);
}

export function weightBounds(weight: number, goal: string, current: boolean) {
  if (current) return { min: 30, max: 250 };
  return { min: goal === 'Gain weight' ? weight + 0.1 : 1, max: goal === 'Lose weight' ? weight - 0.1 : 400 };
}

export function clampWeight(value: string, unit: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed / (unit === 'lbs' ? KG_TO_LB : 1)));
}

export type TargetWeightConcern = {
  projectedBmi: number;
  changePercent: number;
};

export function targetWeightConcern(currentKg: number, targetKg: number, heightCm: number): TargetWeightConcern | null {
  if (![currentKg, targetKg, heightCm].every(Number.isFinite) || currentKg <= 0 || targetKg <= 0 || heightCm <= 0) return null;
  const projectedBmi = targetKg / Math.pow(heightCm / 100, 2);
  const changePercent = Math.abs(targetKg - currentKg) / currentKg * 100;
  if (projectedBmi >= 16 && projectedBmi < 40 && changePercent < 35) return null;
  return { projectedBmi, changePercent };
}

export function dailyNutritionTargets(input: {
  sex: string; birthday: string; age?: number; activity?: string; heightCm: number; weightKg: number;
  targetKg?: number; goal: string; workouts: string; paceKgPerWeek: number;
}, now = new Date()) {
  const [year,month,day]=input.birthday.split('-').map(Number);
  const age=input.age ?? (now.getFullYear()-year-(now.getMonth()+1<month||(now.getMonth()+1===month&&now.getDate()<day)?1:0));
  return nutritionEstimate({age,heightCm:input.heightCm,weightKg:input.weightKg,
    targetKg:input.goal==='Maintain'?input.weightKg:input.targetKg??input.weightKg,
    sex:input.sex.toLowerCase(),activity:input.activity || (input.workouts==='6+'?'active':input.workouts==='3–5'?'moderate':'light'),
    goal:input.goal==='Lose weight'?'lose_fat':input.goal==='Gain weight'?'build_muscle':'maintain',
    pace:input.paceKgPerWeek});
}
