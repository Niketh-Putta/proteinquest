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

export type BarcodeLookupResult = {
  analysis: Analysis;
  code: string;
  fromCatalog: boolean;
};

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanBarcode(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/** Common UPC/EAN padding variants scanners and catalogs disagree on. */
export function barcodeVariants(raw: string): string[] {
  const code = cleanBarcode(raw);
  if (!code) return [];
  const out: string[] = [];
  const push = (c: string) => {
    if (c && !out.includes(c)) out.push(c);
  };
  push(code);
  // UPC-A (12) ↔ EAN-13 (leading 0)
  if (code.length === 12) push(`0${code}`);
  if (code.length === 13 && code.startsWith('0')) push(code.slice(1));
  // Drop / add leading zeros up to EAN-13
  if (code.length < 13) push(code.padStart(13, '0'));
  if (code.length < 12) push(code.padStart(12, '0'));
  if (code.length > 12 && code.startsWith('0')) push(code.replace(/^0+/, '') || code);
  // UPC-E expansion is rare in OFF; keep compact form as-is.
  return out.filter((c) => c.length >= 6 && c.length <= 18);
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

function stubAnalysis(code: string, name?: string, notes?: string): Analysis {
  const food = (name?.trim() || `Product ${code}`).slice(0, 80);
  return {
    is_food: true,
    food_name: food,
    items: [
      {
        name: food.slice(0, 60),
        portion: '1 serving',
        estimated_grams: 100,
        protein_g: 0,
        calories_g: 0,
        confidence: 'low',
      },
    ],
    total_protein_g: 0,
    calories: 0,
    confidence: 'low',
    notes: notes || `Barcode ${code} · enter name & macros`,
  };
}

function analysisFromOff(product: OffProduct, code: string): Analysis {
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

  const name = productName(product, code);
  if (proteinG <= 0 && calories <= 0) {
    return stubAnalysis(
      code,
      name,
      `Barcode ${code} · Open Food Facts (macros missing — edit below)`,
    );
  }

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

/** Look up a packaged product by barcode via Open Food Facts (variants + stub on miss). */
export async function lookupBarcodeProductDetailed(barcode: string): Promise<BarcodeLookupResult> {
  const variants = barcodeVariants(barcode);
  const primary = variants[0] || cleanBarcode(barcode);

  for (const code of variants) {
    const product = await fetchOffProduct(code);
    if (!product) continue;
    return {
      analysis: analysisFromOff(product, code),
      code,
      fromCatalog: true,
    };
  }

  return {
    analysis: stubAnalysis(
      primary,
      undefined,
      `Barcode ${primary} · not in Open Food Facts — enter name & macros`,
    ),
    code: primary,
    fromCatalog: false,
  };
}

/** Look up a packaged product by barcode via Open Food Facts. */
export async function lookupBarcodeProduct(barcode: string): Promise<Analysis | null> {
  const result = await lookupBarcodeProductDetailed(barcode);
  return result.fromCatalog ? result.analysis : null;
}

/** Build a confirm/log analysis when the camera decoded a code but catalog missed. */
export function analysisForUnknownBarcode(barcode: string, name?: string): Analysis {
  const code = cleanBarcode(barcode) || String(barcode || '').trim();
  return stubAnalysis(code, name);
}
