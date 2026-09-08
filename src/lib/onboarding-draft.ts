import AsyncStorage from '@react-native-async-storage/async-storage';

import { getRetention } from './retention';
import { ageFromBirthday, dailyNutritionTargets, type OnboardingAnswers } from './onboarding-flow';
import type { Profile, RetentionState } from './types';

const DRAFT_KEY = 'proteinquest-onboarding-draft-v21';
const OWNER_KEY = 'proteinquest-onboarding-draft-owner';
const SAVED_PREFIX = 'proteinquest-onboarding-saved-';

const CLEAN_KEYS = [
  'sex',
  'workouts',
  'birthday',
  'discovery',
  'previous',
  'height',
  'weight',
  'target',
  'heightUnit',
  'weightUnit',
  'trainer',
  'goal',
  'pace',
  'obstacles',
  'diet',
  'motivation',
  'rollover',
  'notifications',
  'tracking',
  'referral',
  'terms',
  'marketing',
] as const;

export type OnboardingDraft = {
  step: number;
  answers: OnboardingAnswers;
  history: number[];
  login?: boolean;
};

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (!parsed || !Number.isInteger(parsed.step) || parsed.step < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is best-effort.
  }
}

export async function clearOnboardingDraft(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([DRAFT_KEY, OWNER_KEY]);
  } catch {
    // ignore
  }
}

/** Bind draft to authenticated user; clear if a different account resumes. */
export async function guardDraftOwner(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId) {
      await clearOnboardingDraft();
    }
    await AsyncStorage.setItem(OWNER_KEY, userId);
  } catch {
    // ignore
  }
}

export function cleanOnboardingAnswers(answers: OnboardingAnswers): OnboardingAnswers {
  return Object.fromEntries(
    CLEAN_KEYS.filter((k) => answers[k] !== undefined).map((k) => [k, answers[k]]),
  );
}

export function buildProfileUpdatesFromAnswers(
  answers: OnboardingAnswers,
  existing?: Profile | null,
): Partial<Profile> {
  const clean = cleanOnboardingAnswers(answers);
  if (!clean.sex || !clean.goal || !clean.workouts || !clean.terms) {
    throw new Error('Complete your onboarding details before saving.');
  }
  const birthday = String(clean.birthday);
  const age = ageFromBirthday(birthday);
  const targets = dailyNutritionTargets({
    sex: String(clean.sex),
    birthday,
    heightCm: Number(clean.height),
    weightKg: Number(clean.weight),
    targetKg: Number(clean.target ?? clean.weight),
    goal: String(clean.goal),
    workouts: String(clean.workouts),
    paceKgPerWeek: Number(clean.pace ?? 0.5),
  });
  if (!Number.isFinite(age) || age < 18 || ![targets.calories, targets.protein].every(Number.isFinite)) {
    throw new Error('Please review your age and nutrition details.');
  }

  const prevRetention = getRetention(existing);
  const retention: RetentionState = {
    ...prevRetention,
    onboarding: clean,
    calorie_goal_kcal: targets.calories,
  };

  return {
    age,
    weight_kg: Number(clean.weight),
    weight_unit: clean.weightUnit === 'lbs' ? 'lbs' : 'kg',
    sex: clean.sex === 'Male' ? 'male' : clean.sex === 'Female' ? 'female' : null,
    activity_level:
      clean.workouts === '6+' ? 'active' : clean.workouts === '3–5' ? 'moderate' : 'light',
    goal_type:
      clean.goal === 'Lose weight'
        ? 'lose_fat'
        : clean.goal === 'Gain weight'
          ? 'build_muscle'
          : 'maintain',
    protein_goal_g: targets.protein,
    retention,
    intro_completed: true,
    onboarded: true,
    paywall_dismissed: true,
  };
}

export async function markAnswersSaved(userId: string, answers: OnboardingAnswers): Promise<void> {
  const signature = JSON.stringify(cleanOnboardingAnswers(answers));
  await AsyncStorage.setItem(SAVED_PREFIX + userId, signature);
}

export async function wereAnswersSaved(userId: string, answers: OnboardingAnswers): Promise<boolean> {
  const signature = JSON.stringify(cleanOnboardingAnswers(answers));
  const prev = await AsyncStorage.getItem(SAVED_PREFIX + userId);
  return prev === signature;
}
