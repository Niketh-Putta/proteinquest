import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseNutritionNumber, sanitizeNutritionDraft } from './parse-nutrition-number.ts';

describe('parseNutritionNumber', () => {
  it('parses plain and unit-suffixed amounts', () => {
    assert.equal(parseNutritionNumber('12'), 12);
    assert.equal(parseNutritionNumber('12g'), 12);
    assert.equal(parseNutritionNumber('12 g'), 12);
    assert.equal(parseNutritionNumber('12.5'), 12.5);
    assert.equal(parseNutritionNumber('12kcal'), 12);
    assert.equal(parseNutritionNumber('12 cal'), 12);
    assert.equal(parseNutritionNumber('~12'), 12);
  });

  it('treats comma decimals and thousand separators', () => {
    assert.equal(parseNutritionNumber('12,5'), 12.5);
    assert.equal(parseNutritionNumber('1,234'), 1234);
    assert.equal(parseNutritionNumber('1.234,5'), 1234.5);
    assert.equal(parseNutritionNumber('1,234.5'), 1234.5);
  });

  it('returns null for empty or invalid input', () => {
    assert.equal(parseNutritionNumber(''), null);
    assert.equal(parseNutritionNumber('   '), null);
    assert.equal(parseNutritionNumber('abc'), null);
    assert.equal(parseNutritionNumber(null), null);
  });
});

describe('sanitizeNutritionDraft', () => {
  it('strips units but keeps decimal separators', () => {
    assert.equal(sanitizeNutritionDraft('12g'), '12');
    assert.equal(sanitizeNutritionDraft('12,5 kcal'), '12,5');
    assert.equal(sanitizeNutritionDraft('~12.5g protein'), '~12.5');
  });
});
