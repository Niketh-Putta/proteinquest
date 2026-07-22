import { lookupCalorieDensity } from "./calorie-density.ts";

export type CalorieItem = {
  name: string;
  portion?: string;
  estimated_grams?: number;
};

const OILY_PREP_PATTERN =
  /fried|deep.?fried|saut[eé]|pan.?fried|crispy|butter|oil|olive|curry|cream|cheese sauce|mayo|dressing|gravy|battered|breaded|roasted in|glossy/i;

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

/**
 * Bare USDA "cooked" densities exclude absorbed cooking fat, oil, sauce and marinade, so
 * whole-food anchors run ~8% low vs reference scoring. Lift the density sum to a realistic
 * prepared level; oily/fried prep pushes it a little further.
 */
const CALORIE_REALISM_FACTOR = 1.08;

export function prepMethodBuffer(items: CalorieItem[]): number {
  for (const item of items) {
    const text = `${item.portion ?? ""} ${item.name ?? ""}`;
    if (OILY_PREP_PATTERN.test(text)) return CALORIE_REALISM_FACTOR * 1.05;
  }
  return CALORIE_REALISM_FACTOR;
}

/**
 * Realistic calorie total for visual scans — USDA density anchors + prep fat buffer.
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
  if (densitySum <= 0) return fromModel > 0 ? fromModel : 0;

  // Prefer density sum; if model is higher but within 25%, take midpoint.
  if (fromModel <= 0) return Math.round(densitySum);
  if (fromModel > densitySum * 1.25) return Math.round(densitySum * 1.1);
  if (fromModel < densitySum * 0.85) return Math.round(densitySum);
  return Math.round(densitySum * 0.55 + fromModel * 0.45);
}
