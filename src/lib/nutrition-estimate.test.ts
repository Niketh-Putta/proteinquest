import { describe, expect, it } from 'vitest';

import { dailyNutritionTargets } from './onboarding-flow';
import { nutritionEstimate } from './nutrition-estimate';

describe('nutritionEstimate', () => {
  it('matches Mifflin–St Jeor for a typical male cut', () => {
    const result = nutritionEstimate({
      age: 25,
      heightCm: 178,
      weightKg: 80,
      targetKg: 75,
      sex: 'male',
      activity: 'moderate',
      goal: 'lose_fat',
      pace: 0.5,
    });
    // BMR = 10*80 + 6.25*178 - 5*25 + 5 = 1787.5
    // TDEE = 1787.5 * 1.55 = 2770.625; deficit 500 → 2270.625 → round to 10 = 2280
    expect(result.calories).toBe(2280);
    expect(result.protein).toBe(160);
    expect(result.reasoning.length).toBeGreaterThan(2);
  });

  it('onboarding answers and direct estimate stay in lockstep', () => {
    const fromAnswers = dailyNutritionTargets({
      sex: 'Female',
      birthday: '1998-06-15',
      heightCm: 165,
      weightKg: 62,
      targetKg: 58,
      goal: 'Lose weight',
      workouts: '3–5',
      paceKgPerWeek: 0.4,
      age: 27,
    });
    const direct = nutritionEstimate({
      age: 27,
      heightCm: 165,
      weightKg: 62,
      targetKg: 58,
      sex: 'female',
      activity: 'moderate',
      goal: 'lose_fat',
      pace: 0.4,
    });
    expect(fromAnswers.calories).toBe(direct.calories);
    expect(fromAnswers.protein).toBe(direct.protein);
    expect(fromAnswers.protein).toBe(124);
  });
});
