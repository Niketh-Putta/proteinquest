import type { Analysis } from '@/lib/types';

type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
};

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanBarcode(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

function productName(product: OffProduct, code: string): string {
  const name =
    [product.product_name, product.product_name_en, product.generic_name]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .find(Boolean) || '';
  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0]?.trim() : '';
  // Avoid "Nutella · Nutella" when brand is already in the product name.
  const brandUseful =
    brand &&
    !name.toLowerCase().includes(brand.toLowerCase()) &&
    !brand.toLowerCase().includes(name.toLowerCase());
  const joined = [name, brandUseful ? brand : null].filter(Boolean).join(' · ').trim();
  return (joined || `Product ${code}`).slice(0, 80);
}

function analysisFromOff(product: OffProduct, code: string): Analysis | null {
  const n = product.nutriments ?? {};
  const protein100 = num(n.proteins_100g) ?? num(n.proteins) ?? 0;
  const kcal100 =
    num(n['energy-kcal_100g']) ??
    num(n['energy-kcal_value']) ??
    num(n['energy-kcal']) ??
    (num(n.energy_100g) != null ? Math.round(Number(n.energy_100g) / 4.184) : null) ??
    0;

  const proteinServing = num(n.proteins_serving);
  const kcalServing =
    num(n['energy-kcal_serving']) ??
    (num(n.energy_serving) != null ? Math.round(Number(n.energy_serving) / 4.184) : null);

  const servingRaw = num(product.serving_quantity);
  const hasServingMacros =
    (proteinServing != null && proteinServing > 0) || (kcalServing != null && kcalServing > 0);

  let grams = 100;
  let proteinG = Math.max(0, Math.round(protein100 * 10) / 10);
  let calories = Math.max(0, Math.round(kcal100));

  if (hasServingMacros) {
    proteinG = Math.max(0, Math.round((proteinServing ?? 0) * 10) / 10);
    calories = Math.max(0, Math.round(kcalServing ?? Math.max(proteinG * 8, 50)));
    grams =
      servingRaw != null && servingRaw > 0 && servingRaw <= 2000
        ? Math.round(servingRaw)
        : 100;
  } else if (servingRaw != null && servingRaw > 0 && servingRaw <= 2000) {
    grams = Math.round(servingRaw);
    const scale = grams / 100;
    proteinG = Math.max(0, Math.round(protein100 * scale * 10) / 10);
    calories = Math.max(0, Math.round(kcal100 * scale));
  }

  if (proteinG <= 0 && calories <= 0) return null;

  const name = productName(product, code);
  const portion =
    product.serving_size?.trim() ||
    (grams === 100 ? '100g' : `${grams}g serving`);
  const safeProtein = proteinG > 0 ? proteinG : 1;
  const safeCalories =
    calories > 0 ? calories : Math.max(Math.round(safeProtein * 8), 50);

  return {
    is_food: true,
    food_name: name,
    items: [
      {
        name: name.slice(0, 60),
        portion,
        estimated_grams: grams,
        protein_g: safeProtein,
        calories_g: safeCalories,
        confidence: 'high',
      },
    ],
    total_protein_g: safeProtein,
    calories: safeCalories,
    confidence: 'high',
    notes: `Barcode ${code} · Open Food Facts`,
  };
}

async function fetchOffProduct(code: string): Promise<OffProduct | null> {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ProteinQuest/1.0 (https://proteinquest.vercel.app)',
  };

  // v2 first, then v0 fallback (some older codes resolve only on v0).
  const urls = [
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const body = (await res.json()) as { status?: number | string; product?: OffProduct };
      const ok = body.status === 1 || body.status === '1';
      if (ok && body.product) return body.product;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Look up a packaged product by barcode via Open Food Facts. */
export async function lookupBarcodeProduct(barcode: string): Promise<Analysis | null> {
  const code = cleanBarcode(barcode);
  if (code.length < 6 || code.length > 18) return null;

  const product = await fetchOffProduct(code);
  if (!product) return null;
  return analysisFromOff(product, code);
}
