import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CALORIE_OVERRIDE_BUFFER,
  PROTEIN_OVERRIDE_BUFFER_G,
  clampCalorieOverride,
  clampProteinOverride,
  maxAllowedOverride,
  nutritionClampAnchor,
} from './log-limits.ts';

test('nutritionClampAnchor uses the strongest signal', () => {
  assert.equal(nutritionClampAnchor(20, 5.6, 0), 20);
  assert.equal(nutritionClampAnchor(20, 45), 45);
});

test('maxAllowedOverride applies tolerance plus absolute buffer', () => {
  assert.equal(maxAllowedOverride(40, PROTEIN_OVERRIDE_BUFFER_G), Math.ceil(40 * 1.5 + 15));
  assert.equal(maxAllowedOverride(0, PROTEIN_OVERRIDE_BUFFER_G), 15);
});

test('protein within band is left untouched', () => {
  const res = clampProteinOverride(45, 40);
  assert.equal(res.clamped, false);
  assert.equal(res.value, 45);
});

test('protein far above anchor is capped', () => {
  const res = clampProteinOverride(200, 30);
  assert.equal(res.clamped, true);
  assert.equal(res.value, res.max);
  assert.equal(res.max, Math.ceil(30 * 1.5 + 15));
});

test('lowering protein is always allowed', () => {
  const res = clampProteinOverride(5, 60);
  assert.equal(res.clamped, false);
  assert.equal(res.value, 5);
});

test('tiny anchor still allows reasonable correction via buffer', () => {
  const res = clampProteinOverride(18, 2);
  assert.equal(res.clamped, false); // max = ceil(2*1.5 + 15) = 18
});

test('calories use a larger buffer', () => {
  assert.equal(maxAllowedOverride(500, CALORIE_OVERRIDE_BUFFER), Math.ceil(500 * 1.5 + 200));
  const res = clampCalorieOverride(5000, 400);
  assert.equal(res.clamped, true);
  assert.equal(res.value, res.max);
});

test('non-finite or negative entries pass through unchanged', () => {
  const nan = clampProteinOverride(Number.NaN, 40);
  assert.equal(nan.clamped, false);
  const neg = clampProteinOverride(-5, 40);
  assert.equal(neg.clamped, false);
});
