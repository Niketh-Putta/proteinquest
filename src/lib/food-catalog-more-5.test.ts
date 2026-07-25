import assert from 'node:assert/strict';
import test from 'node:test';

import { MORE_FOODS_5 } from './food-catalog-more-5.ts';

test('MORE_FOODS_5 has substantial coverage', () => {
  assert.ok(MORE_FOODS_5.length >= 500, `expected >= 500, got ${MORE_FOODS_5.length}`);
});

test('MORE_FOODS_5 entries match CatalogFood shape', () => {
  for (const food of MORE_FOODS_5) {
    assert.equal(typeof food.name, 'string');
    assert.ok(food.name.trim().length > 0);
    assert.equal(typeof food.portion, 'string');
    assert.ok(food.portion.trim().length > 0);
    assert.equal(typeof food.protein_g, 'number');
    assert.ok(Number.isFinite(food.protein_g));
    assert.ok(food.protein_g >= 0);
    assert.equal(typeof food.calories_g, 'number');
    assert.ok(Number.isFinite(food.calories_g));
    assert.ok(food.calories_g >= 0);
    if (food.estimated_grams !== undefined) {
      assert.ok(food.estimated_grams > 0);
    }
    if (food.aliases) {
      assert.ok(Array.isArray(food.aliases));
      for (const a of food.aliases) assert.ok(String(a).trim().length > 0);
    }
  }
});

test('MORE_FOODS_5 names are unique (case-insensitive)', () => {
  const seen = new Set<string>();
  for (const food of MORE_FOODS_5) {
    const key = food.name.trim().toLowerCase();
    assert.equal(seen.has(key), false, `duplicate name: ${food.name}`);
    seen.add(key);
  }
});

test('MORE_FOODS_5 includes whole-meal and ingredient style entries', () => {
  const names = MORE_FOODS_5.map((f) => f.name.toLowerCase());
  assert.ok(names.some((n) => n.includes('thali')));
  assert.ok(names.some((n) => n.includes('ready meal') || n.includes('meal deal')));
  assert.ok(names.some((n) => n.includes('shawarma') || n.includes('burrito')));
  assert.ok(names.some((n) => n.includes('tofu') || n.includes('rice') || n.includes('yogurt')));
});
