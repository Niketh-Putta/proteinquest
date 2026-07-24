import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lookupBarcodeProduct } from './barcode.ts';

describe('lookupBarcodeProduct', () => {
  it('resolves Nutella (3017620422003) from Open Food Facts', async () => {
    const product = await lookupBarcodeProduct('3017620422003');
    assert.ok(product, 'expected OFF product');
    assert.equal(product.is_food, true);
    assert.match(product.food_name, /nutella/i);
    assert.ok(product.total_protein_g > 0);
    assert.ok(product.calories > 0);
    assert.ok(product.items?.length >= 1);
  });
});
