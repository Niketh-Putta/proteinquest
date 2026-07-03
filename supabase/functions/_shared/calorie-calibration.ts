import { lookupCalorieDensity } from "./calorie-density.ts";

export type CalorieItem = {
  name: string;
  portion?: string;
  estimated_grams?: number;
};

/** Final downward nudge on visual scans after USDA anchor pass. */
export const VISUAL_CALORIE_BIAS = 0.88;

const OILY_PREP_PATTERN =
  /fried|deep.?fried|saut[eé]|pan.?fried|crispy|butter|oil|curry|cream|cheese sauce|mayo|dressing|gravy|battered|breaded|roasted in/i;

export function caloriesFromDensity(items: CalorieItem[]): number {
  let sum = 0;
  for (const item of items) {
    const grams = item.estimated_grams;
    if (!grams || grams <= 0) continue;
    const kcalPer100g = lookupCalorieDensity(item.name);
    if (kcalPer100g) sum += (grams * kcalPer100g) / 100;
  }
  return sum;
}

export function prepMethodBuffer(items: CalorieItem[]): number {
  for (const item of items) {
    const text = `${item.portion ?? ""} ${item.name ?? ""}`;
    if (OILY_PREP_PATTERN.test(text)) return 1.08;
  }
  return 1;
}

/**
 * Conservative calorie total for visual scans — USDA density anchors, no upward bias.
 * Label calories are trusted when present.
 */
export function deriveCalibratedCalories(
  items: CalorieItem[],
  rawCalories: unknown,
  fromLabel = false,
): number {
  if (items.length === 0) return Math.round(Number(rawCalories) || 0);

  const fromModel = Math.round(Number(rawCalories) || 0);
  let densitySum = caloriesFromDensity(items);
  if (densitySum > 0) densitySum *= prepMethodBuffer(items);

  if (fromLabel && fromModel > 0) return fromModel;
  if (densitySum <= 0) return fromModel > 0 ? Math.round(fromModel * VISUAL_CALORIE_BIAS) : 0;

  const base = fromModel > 0 ? Math.min(fromModel, densitySum) : densitySum;
  return Math.round(base * VISUAL_CALORIE_BIAS);
}
