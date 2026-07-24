import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  barcodeVariants,
  lookupBarcodeProduct,
  lookupBarcodeProductDetailed,
} from './barcode.ts';

describe('barcodeVariants', () => {
  it('pads UPC-A to EAN-13', () => {
    const v = barcodeVariants('096619968312');
    assert.ok(v.includes('096619968312'));
    assert.ok(v.includes('0096619968312'));
  });
});

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

  it('resolves Kirkland dried blueberries via UPC variant', async () => {
    const result = await lookupBarcodeProductDetailed('096619615223');
    assert.equal(result.fromCatalog, true);
    assert.match(result.analysis.food_name, /blueberry|blueberries/i);
  });

  it('returns stub analysis when code is unknown', async () => {
    const result = await lookupBarcodeProductDetailed('000000000001');
    assert.equal(result.fromCatalog, false);
    assert.ok(result.analysis.food_name.includes('000000000001'));
    assert.match(result.analysis.notes || '', /not in Open Food Facts/i);
  });
});
