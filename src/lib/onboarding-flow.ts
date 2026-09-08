import { nutritionEstimate } from './nutrition-estimate';

export const KG_TO_LB = 2.2046226218;

export function isAdult(birthday: string, now = new Date()) {
  const [year, month, day] = birthday.split('-').map(Number);
  const birth = new Date(year, month - 1, day);
  if (!year || birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return false;
  }
  const age =
    now.getFullYear() -
    year -
    (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day) ? 1 : 0);
  return age >= 18;
}

export function ageFromBirthday(birthday: string, now = new Date()) {
  const [year, month, day] = birthday.split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return (
    now.getFullYear() -
    year -
    (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day) ? 1 : 0)
  );
}

/** Advance through reachable demo steps. Maintain skips target (11) + pace (12-13). */
export function nextStep(step: number, goal: string) {
  if (step === 19 || step === 20 || step === 21) return 22;
  if (step === 22 || step === 23) return 24;
  return step === 10 && goal === 'Maintain' ? 14 : Math.min(30, step + 1);
}

export function suggestedTarget(weight: number, goal: string) {
  return goal === 'Maintain'
    ? weight
    : goal === 'Lose weight'
      ? Math.max(1, weight - 5)
      : Math.min(400, weight + 1.9);
}

export function weightBounds(weight: number, goal: string, current: boolean) {
  if (current) return { min: 30, max: 250 };
  return {
    min: goal === 'Gain weight' ? weight + 0.1 : 1,
    max: goal === 'Lose weight' ? weight - 0.1 : 400,
  };
}

export function clampWeight(
  value: string,
  unit: string,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed / (unit === 'lbs' ? KG_TO_LB : 1)));
}

export type TargetWeightConcern = {
  projectedBmi: number;
  changePercent: number;
};

export function targetWeightConcern(
  currentKg: number,
  targetKg: number,
  heightCm: number,
): TargetWeightConcern | null {
  if (![currentKg, targetKg, heightCm].every(Number.isFinite) || currentKg <= 0 || targetKg <= 0 || heightCm <= 0) {
    return null;
  }
  const projectedBmi = targetKg / Math.pow(heightCm / 100, 2);
  const changePercent = (Math.abs(targetKg - currentKg) / currentKg) * 100;
  if (projectedBmi >= 16 && projectedBmi < 40 && changePercent < 35) return null;
  return { projectedBmi, changePercent };
}

export function dailyNutritionTargets(
  input: {
    sex: string;
    birthday: string;
    age?: number;
    activity?: string;
    heightCm: number;
    weightKg: number;
    targetKg?: number;
    goal: string;
    workouts: string;
    paceKgPerWeek: number;
  },
  now = new Date(),
) {
  const age = input.age ?? ageFromBirthday(input.birthday, now);
  return nutritionEstimate({
    age,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    targetKg: input.goal === 'Maintain' ? input.weightKg : (input.targetKg ?? input.weightKg),
    sex: input.sex.toLowerCase(),
    activity:
      input.activity ||
      (input.workouts === '6+' ? 'active' : input.workouts === '3–5' ? 'moderate' : 'light'),
    goal:
      input.goal === 'Lose weight'
        ? 'lose_fat'
        : input.goal === 'Gain weight'
          ? 'build_muscle'
          : 'maintain',
    pace: input.paceKgPerWeek,
  });
}

export const ONBOARDING_QUESTIONS: Record<
  number,
  { title: string; sub?: string; key: string; options: [string, string][] }
> = {
  1: {
    title: 'Choose your sex',
    sub: 'This helps personalize your experience.',
    key: 'sex',
    options: [
      ['Male', ''],
      ['Female', ''],
      ['Other', ''],
    ],
  },
  2: {
    title: 'How many workouts do you do per week?',
    sub: 'This will be used to calibrate your custom plan.',
    key: 'workouts',
    options: [
      ['0–2', 'Workouts now and then'],
      ['3–5', 'A few workouts per week'],
      ['6+', 'Dedicated athlete'],
    ],
  },
  4: {
    title: 'Where did you hear about us?',
    key: 'discovery',
    options: [
      ['Friend or family', ''],
      ['App Store', ''],
      ['TV', ''],
      ['YouTube', ''],
      ['Instagram', ''],
      ['Google', ''],
      ['TikTok', ''],
      ['X', ''],
      ['Facebook', ''],
      ['Other', ''],
    ],
  },
  5: {
    title: 'Have you tried other calorie tracking apps?',
    key: 'previous',
    options: [
      ['Yes', ''],
      ['No', ''],
    ],
  },
  9: {
    title: 'Do you currently work with a personal trainer or registered dietitian?',
    key: 'trainer',
    options: [
      ['Yes', ''],
      ['No', ''],
    ],
  },
  10: {
    title: 'What is your goal?',
    sub: 'This helps us generate a plan for your calorie intake.',
    key: 'goal',
    options: [
      ['Gain weight', ''],
      ['Maintain', ''],
      ['Lose weight', ''],
    ],
  },
  15: {
    title: "What's stopping you from reaching your goals?",
    key: 'obstacles',
    options: [
      ['Lack of consistency', ''],
      ['Unhealthy eating habits', ''],
      ['Lack of support', ''],
      ['Busy schedule', ''],
      ['Lack of meal inspiration', ''],
    ],
  },
  16: {
    title: 'Do you follow a specific diet?',
    key: 'diet',
    options: [
      ['Balanced', ''],
      ['Whole-food focus', ''],
      ['Mediterranean', ''],
      ['Flexitarian', ''],
      ['Pescatarian', ''],
      ['Vegetarian', ''],
      ['Vegan', ''],
      ['Low-carb', ''],
      ['Keto', ''],
      ['Paleo', ''],
    ],
  },
  17: {
    title: 'What would you like to accomplish?',
    key: 'motivation',
    options: [
      ['Eat and live healthier', ''],
      ['Boost my energy and mood', ''],
      ['Stay motivated and consistent', ''],
      ['Feel better about my body', ''],
    ],
  },
};

export type OnboardingAnswers = Record<string, string | number | boolean>;

export const INITIAL_ONBOARDING_ANSWERS: OnboardingAnswers = {
  sex: '',
  workouts: '',
  birthday: '2000-01-01',
  discovery: '',
  previous: '',
  height: 170,
  weight: 65.5,
  target: 67.4,
  heightUnit: 'cm',
  weightUnit: 'kg',
  trainer: '',
  goal: '',
  pace: 0.5,
  obstacles: '',
  diet: '',
  motivation: '',
  exercise: false,
  rollover: false,
  notifications: false,
  tracking: false,
  referral: '',
  terms: false,
  marketing: false,
  auth: '',
};

/** Progress bar against questionnaire portion (steps 1–28). */
export function onboardingProgress(step: number) {
  const effective = step > 20 ? step - 1 : step;
  return Math.min(100, (effective / 28) * 100);
}
