import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
