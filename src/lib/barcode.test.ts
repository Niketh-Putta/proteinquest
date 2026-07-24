import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  barcodeVariants,
  extractOffIngredients,
  lookupBarcodeProduct,
  lookupBarcodeProductDetailed,
  parseIngredientsText,
} from './barcode.ts';

describe('barcodeVariants', () => {
  it('pads UPC-A to EAN-13', () => {
    const v = barcodeVariants('096619968312');
    assert.ok(v.includes('096619968312'));
    assert.ok(v.includes('0096619968312'));
  });
});

describe('parseIngredientsText', () => {
  it('splits labels and drops percentages / gluten-free notes', () => {
    const items = parseIngredientsText(
      'Sugar, palm oil, HAZELNUTS 13%, low-fat cocoa 7.4%; vanillin. Gluten free',
    );
    assert.ok(items.some((i) => /sugar/i.test(i)));
    assert.ok(items.some((i) => /hazelnut/i.test(i)));
    assert.ok(items.some((i) => /vanillin/i.test(i)));
    assert.ok(!items.some((i) => /gluten/i.test(i)));
    assert.ok(!items.some((i) => /%/.test(i)));
  });
});

describe('extractOffIngredients', () => {
  it('prefers English ingredients text', () => {
    const items = extractOffIngredients({
      ingredients_text: 'Sucre, huile de palme',
      ingredients_text_en: 'Sugar, palm oil, hazelnuts',
    });
    assert.deepEqual(items.slice(0, 3), ['Sugar', 'palm oil', 'hazelnuts']);
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
    // Confirm list should show real ingredients, not only "Nutella"
    const names = (product.items ?? []).map((i) => i.name.toLowerCase()).join(' ');
    assert.ok(/sugar|palm|hazelnut|cocoa|milk|lecithin|vanillin/.test(names));
  });

  it('resolves Kirkland dried blueberries via UPC variant', async () => {
    const result = await lookupBarcodeProductDetailed('096619615223');
    assert.equal(result.fromCatalog, true);
    assert.match(result.analysis.food_name, /blueberry|blueberries/i);
  });

  it('avoids barcode-as-name when OFF only has the code as product_name', async () => {
    const result = await lookupBarcodeProductDetailed('0811594100102');
    assert.equal(result.fromCatalog, true);
    assert.ok(!/^0811594100102$/.test(result.analysis.food_name));
    assert.match(result.analysis.food_name, /product/i);
  });

  it('returns stub analysis when code is unknown', async () => {
    const result = await lookupBarcodeProductDetailed('000000000001');
    assert.equal(result.fromCatalog, false);
    assert.ok(result.analysis.food_name.includes('000000000001'));
    assert.match(result.analysis.notes || '', /not in catalog/i);
  });
});
