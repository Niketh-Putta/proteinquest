import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdult, nextStep, suggestedTarget, weightBounds, clampWeight, KG_TO_LB, targetWeightConcern } from './onboarding-flow.ts';

test('age gate handles the exact birthday, minors, future dates and invalid dates', () => {
 const now = new Date(2026, 8, 7);
 assert.equal(isAdult('2008-09-07', now), true);
 assert.equal(isAdult('2008-09-08', now), false);
 assert.equal(isAdult('2010-01-01', now), false);
 assert.equal(isAdult('2030-01-01', now), false);
 assert.equal(isAdult('2000-02-30', now), false);
 assert.equal(isAdult('bad', now), false);
});
test('maintain skips target and pace; gain and loss retain those steps', () => {
 assert.equal(nextStep(19, 'Gain weight'), 21);
 assert.equal(nextStep(20, 'Maintain'), 21);
 assert.equal(nextStep(10, 'Maintain'), 14);
 assert.equal(nextStep(10, 'Gain weight'), 11);
 assert.equal(nextStep(10, 'Lose weight'), 11);
 assert.equal(nextStep(34, 'Maintain'), 34);
});
test('goal direction remains valid at allowed current-weight boundaries', () => {
 for (const weight of [30, 65.5, 250]) {
  for (const goal of ['Lose weight', 'Gain weight', 'Maintain']) {
   const target = suggestedTarget(weight, goal);
   const { min, max } = weightBounds(weight, goal, false);
   assert.ok(min < max);
   assert.ok(target >= min && target <= max);
   if (goal === 'Maintain') assert.equal(target, weight);
   if (goal === 'Lose weight') assert.ok(target < weight);
   if (goal === 'Gain weight') assert.ok(target > weight);
  }
 }
});
test('unit conversions preserve weight and edits are clamped after entry', () => {
 assert.ok(Math.abs(clampWeight(String(65.5 * KG_TO_LB), 'lbs', 30, 250, 60) - 65.5) < 0.00001);
 assert.equal(clampWeight('60', 'kg', 30, 250, 65.5), 60);
 assert.equal(clampWeight('', 'kg', 30, 250, 65.5), 65.5);
 assert.equal(clampWeight('abc', 'kg', 30, 250, 65.5), 65.5);
 assert.equal(clampWeight('999', 'kg', 30, 250, 65.5), 250);
 assert.equal(clampWeight('-10', 'kg', 30, 250, 65.5), 30);
});
test('extreme target changes are flagged without blocking ordinary goals', () => {
 assert.equal(targetWeightConcern(80, 70, 180), null);
 assert.equal(targetWeightConcern(65, 70, 170), null);
 assert.ok(targetWeightConcern(80, 45, 180));
 assert.ok(targetWeightConcern(65, 120, 170));
 assert.ok(targetWeightConcern(65, 45, 180));
 assert.equal(targetWeightConcern(0, 45, 180), null);
});
