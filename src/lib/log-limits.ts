/**
 * Anti-cheat guardrails on how far a user can edit the AI's protein/calorie
 * estimate before logging. The AI estimate is the anchor; users can correct
 * genuine errors within a band, but can't inflate a snack into a goal-hitting
 * meal to farm XP, streaks, or leaderboard rank.
 *
 * Only the upper bound matters for cheating (lowering a value never helps), so
 * we clamp values that exceed the anchor by more than the allowed band.
 */

/** Fraction above the anchor a user may add (0.5 = +50%). */
export const OVERRIDE_TOLERANCE = 0.5;

/** Absolute slack so tiny anchors still allow reasonable correction. */
export const PROTEIN_OVERRIDE_BUFFER_G = 15;
export const CALORIE_OVERRIDE_BUFFER = 200;

export type ClampResult = {
  /** The value to actually use (clamped to `max` when needed). */
  value: number;
  /** True when the entered value exceeded the allowed maximum. */
  clamped: boolean;
  /** The maximum value permitted for this anchor. */
  max: number;
};

/** Clamp against the strongest signal: original AI, current header, or ingredient sum. */
export function nutritionClampAnchor(...values: number[]): number {
  let max = 0;
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Highest value a user may enter for a given AI anchor. */
export function maxAllowedOverride(
  anchor: number,
  buffer: number,
  tolerance: number = OVERRIDE_TOLERANCE,
): number {
  const safeAnchor = Number.isFinite(anchor) && anchor > 0 ? anchor : 0;
  return Math.ceil(safeAnchor * (1 + tolerance) + buffer);
}

function clampOverride(
  entered: number,
  anchor: number,
  buffer: number,
  tolerance: number = OVERRIDE_TOLERANCE,
): ClampResult {
  const max = maxAllowedOverride(anchor, buffer, tolerance);
  if (!Number.isFinite(entered) || entered < 0) {
    return { value: entered, clamped: false, max };
  }
  if (entered > max) {
    return { value: max, clamped: true, max };
  }
  return { value: entered, clamped: false, max };
}

export function clampProteinOverride(entered: number, anchor: number): ClampResult {
  return clampOverride(entered, anchor, PROTEIN_OVERRIDE_BUFFER_G);
}

export function clampCalorieOverride(entered: number, anchor: number): ClampResult {
  return clampOverride(entered, anchor, CALORIE_OVERRIDE_BUFFER);
}
