import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAdjustWheelUnit,
  formatCountUnitLabel,
  resolveAdjustCountUnit,
} from './scan-ingredient-edit.ts';

test('resolveAdjustCountUnit keeps serving labels as serving', () => {
  assert.equal(resolveAdjustCountUnit('Chicken', '1 serving'), 'serving');
  assert.equal(formatCountUnitLabel('serving', 2), 'servings');
});

test('resolveAdjustCountUnit picks vessel and slice units', () => {
  assert.equal(resolveAdjustCountUnit('Rice', '1 cup'), 'cup');
  assert.equal(resolveAdjustCountUnit('Bread', '2 slices'), 'slice');
  assert.equal(resolveAdjustCountUnit('Dal', '1 bowl'), 'bowl');
});

test('resolveAdjustCountUnit uses servings for curries and meals', () => {
  assert.equal(resolveAdjustCountUnit('Gongura prawns', '1 serving'), 'serving');
  assert.equal(resolveAdjustCountUnit('Prawn curry', '1 bowl'), 'serving');
  assert.equal(resolveAdjustCountUnit('Mapo tofu', '1 bowl'), 'serving');
  assert.equal(resolveAdjustCountUnit('Chicken jollof', '1 plate'), 'serving');
});

test('formatCountUnitLabel pluralizes spoonful and drizzle', () => {
  assert.equal(formatCountUnitLabel('spoonful', 1), 'spoonful');
  assert.equal(formatCountUnitLabel('spoonful', 2), 'spoonfuls');
  assert.equal(formatCountUnitLabel('drizzle', 2), 'drizzles');
});

test('whole foods keep count labels even when portion is grams-only', () => {
  assert.equal(resolveAdjustCountUnit('Banana', '20 g'), 'banana');
  assert.equal(resolveAdjustCountUnit('Egg', '50 g'), 'egg');
  assert.equal(formatAdjustWheelUnit('Banana', '20 g', 14.75), 'bananas');
  assert.equal(formatAdjustWheelUnit('Banana', '1 banana', 14.75), 'bananas');
  assert.equal(formatAdjustWheelUnit('Egg', '1 egg', 2), 'eggs');
  assert.equal(formatAdjustWheelUnit('Apple', '1 medium apple', 3), 'apples');
});
