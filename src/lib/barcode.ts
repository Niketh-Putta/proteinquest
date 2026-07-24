import type { Analysis, FoodItem } from '@/lib/types';

type OffIngredient = {
  text?: string;
  id?: string;
  percent?: number | string;
  ingredients?: OffIngredient[];
};

type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  ingredients_text?: string;
  ingredients_text_en?: string;
  ingredients_text_with_allergens?: string;
  ingredients_text_with_allergens_en?: string;
  ingredients?: OffIngredient[];
  nutriments?: Record<string, number | string | undefined>;
};

export type BarcodeLookupResult = {
  analysis: Analysis;
  code: string;
  fromCatalog: boolean;
};

const MAX_INGREDIENT_ITEMS = 24;

const NON_INGREDIENT_RE =
  /^(gluten[\s-]?free|sans gluten|may contain|contains?|allergens?|trace[s]?|produced in|packaged in|suitable for)\b/i;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanBarcode(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * GTIN check digit (UPC-A / EAN-8 / EAN-13 / GTIN-14).
 * Rejects truncated/misread camera codes that would never resolve.
 */
export function isValidGtin(raw: string): boolean {
  const code = cleanBarcode(raw);
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code)) return false;
  const digits = code.split('').map((d) => Number(d));
  const check = digits.pop();
  if (check == null || digits.some((d) => !Number.isFinite(d))) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits[digits.length - 1 - i]!;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === check;
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
  // Drop / add leading zeros up to EAN-13 / GTIN-14
  if (code.length < 13) push(code.padStart(13, '0'));
  if (code.length < 12) push(code.padStart(12, '0'));
  if (code.length < 14) push(code.padStart(14, '0'));
  if (code.length > 12 && code.startsWith('0')) push(code.replace(/^0+/, '') || code);
  // Prefer checksum-valid variants first, then the rest.
  const valid = out.filter(isValidGtin);
  const rest = out.filter((c) => !isValidGtin(c) && c.length >= 8 && c.length <= 18);
  return [...valid, ...rest];
}

function looksLikeBarcodeName(value: string, code: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!digits || digits.length < 8) return false;
  const variants = new Set(barcodeVariants(code));
  variants.add(cleanBarcode(code));
  return variants.has(digits);
}

function productName(product: OffProduct, code: string): string {
  const name =
    [product.product_name, product.product_name_en, product.generic_name]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .find((s) => s && !looksLikeBarcodeName(s, code)) || '';
  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0]?.trim() : '';
  const brandUseful =
    brand &&
    !looksLikeBarcodeName(brand, code) &&
    !name.toLowerCase().includes(brand.toLowerCase()) &&
    !brand.toLowerCase().includes(name.toLowerCase());
  const joined = [name, brandUseful ? brand : null].filter(Boolean).join(' · ').trim();
  if (joined) return joined.slice(0, 80);
  if (brand && !looksLikeBarcodeName(brand, code)) return brand.slice(0, 80);
  return `Product ${code}`.slice(0, 80);
}

/** Clean one OFF ingredient label for the confirm list. */
export function cleanIngredientLabel(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\d+(?:[.,]\d+)?\s*%/g, '');
  s = s.replace(/[[\](){}]/g, ' ');
  // Drop trailing label notes: "vanillin. Gluten free"
  s = s.replace(
    /[.;]\s*(?:gluten[\s-]?free|sans gluten|may contain|contains?|allergens?)\b.*$/i,
    '',
  );
  s = s.replace(/\s*[:：]\s*$/g, '');
  s = s.replace(/[.;]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || NON_INGREDIENT_RE.test(s)) return '';
  if (looksLikeBarcodeName(s, s.replace(/\D/g, ''))) return '';
  // Title-ish: keep ALL-CAPS allergens readable as words.
  if (s === s.toUpperCase() && s.length > 2) {
    s = s
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s.slice(0, 60);
}

/** Split OFF ingredients_text into display names. */
export function parseIngredientsText(text: string): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[,;，；\n]+/)
    .map((p) => cleanIngredientLabel(p))
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
    if (out.length >= MAX_INGREDIENT_ITEMS) break;
  }
  return out;
}

function ingredientFromStructured(node: OffIngredient): string {
  const text = typeof node.text === 'string' ? node.text.trim() : '';
  if (text) return cleanIngredientLabel(text);
  const id = typeof node.id === 'string' ? node.id : '';
  if (!id) return '';
  const label = id.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
  return cleanIngredientLabel(label);
}

/** Prefer English text, then local text, then structured tree. */
export function extractOffIngredients(product: OffProduct): string[] {
  const textCandidates = [
    product.ingredients_text_en,
    product.ingredients_text_with_allergens_en,
    product.ingredients_text,
    product.ingredients_text_with_allergens,
  ];
  for (const text of textCandidates) {
    if (typeof text === 'string' && text.trim()) {
      const parsed = parseIngredientsText(text);
      if (parsed.length > 0) return parsed;
    }
  }

  const structured = product.ingredients;
  if (!Array.isArray(structured) || structured.length === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (nodes: OffIngredient[]) => {
    for (const node of nodes) {
      if (out.length >= MAX_INGREDIENT_ITEMS) return;
      const children = Array.isArray(node.ingredients) ? node.ingredients : [];
      // Prefer leaf-ish labels; if parent has children, still include parent once.
      const label = ingredientFromStructured(node);
      if (label) {
        const key = label.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(label);
        }
      }
      if (children.length > 0) walk(children);
    }
  };
  walk(structured);
  return out;
}

function ingredientItems(names: string[]): FoodItem[] {
  return names.map((name) => ({
    name,
    portion: 'ingredient',
    estimated_grams: undefined,
    protein_g: 0,
    calories_g: 0,
    confidence: 'medium' as const,
  }));
}

function stubAnalysis(
  code: string,
  name?: string,
  notes?: string,
  ingredientNames: string[] = [],
): Analysis {
  const food = (name?.trim() || `Product ${code}`).slice(0, 80);
  const items =
    ingredientNames.length > 0
      ? ingredientItems(ingredientNames)
      : [
          {
            name: food.slice(0, 60),
            portion: '1 serving',
            estimated_grams: 100,
            protein_g: 0,
            calories_g: 0,
            confidence: 'low' as const,
          },
        ];
  const notesBase = notes || `Barcode ${code} · enter name & macros`;
  const withIng =
    ingredientNames.length > 0 && !/ingredient/i.test(notesBase)
      ? `${notesBase} · ${ingredientNames.length} ingredients`
      : notesBase;
  return {
    is_food: true,
    food_name: food,
    items,
    total_protein_g: 0,
    calories: 0,
    confidence: 'low',
    notes: withIng,
  };
}

function analysisFromOff(product: OffProduct, code: string, sourceLabel: string): Analysis {
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
  const ingredients = extractOffIngredients(product);

  if (proteinG <= 0 && calories <= 0) {
    return stubAnalysis(
      code,
      name,
      `Barcode ${code} · ${sourceLabel} (macros missing - edit below)`,
      ingredients,
    );
  }

  const portion =
    product.serving_size?.trim() ||
    (grams === 100 ? '100g' : `${grams}g serving`);
  const safeProtein = proteinG > 0 ? proteinG : 1;
  const safeCalories =
    calories > 0 ? calories : Math.max(Math.round(safeProtein * 8), 50);

  const items: FoodItem[] =
    ingredients.length > 0
      ? ingredientItems(ingredients)
      : [
          {
            name: name.slice(0, 60),
            portion,
            estimated_grams: grams,
            protein_g: safeProtein,
            calories_g: safeCalories,
            confidence: 'high',
          },
        ];

  const notesExtra =
    ingredients.length > 0 ? ` · ${ingredients.length} ingredients` : '';

  return {
    is_food: true,
    food_name: name,
    items,
    total_protein_g: safeProtein,
    calories: safeCalories,
    confidence: 'high',
    notes: `Barcode ${code} · ${sourceLabel}${notesExtra}`,
  };
}

const OFF_HOSTS = [
  'https://world.openfoodfacts.org',
  'https://uk.openfoodfacts.org',
  'https://us.openfoodfacts.org',
  'https://world.openbeautyfacts.org',
  'https://world.openproductsfacts.org',
] as const;

const BARCODE_FETCH_TIMEOUT_MS = 2_500;

async function fetchOffProduct(code: string): Promise<{ product: OffProduct; source: string } | null> {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ProteinQuest/1.0 (https://proteinquest.app)',
  };

  for (const host of OFF_HOSTS) {
    const label = host.includes('beauty')
      ? 'Open Beauty Facts'
      : host.includes('products')
        ? 'Open Products Facts'
        : 'Open Food Facts';
    const urls = [
      `${host}/api/v2/product/${encodeURIComponent(code)}.json`,
      `${host}/api/v0/product/${encodeURIComponent(code)}.json`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(BARCODE_FETCH_TIMEOUT_MS),
        });
        if (!res.ok) continue;
        const body = (await res.json()) as {
          status?: number | string;
          product?: OffProduct;
          status_verbose?: string;
        };
        const ok = body.status === 1 || body.status === '1';
        if (ok && body.product) return { product: body.product, source: label };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

type UpcItem = {
  title?: string;
  brand?: string;
  description?: string;
};

/** Server-friendly; may fail CORS in browser - safe to try. */
async function fetchUpcItemDb(code: string): Promise<OffProduct | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(BARCODE_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: UpcItem[]; code?: string };
    const item = body.items?.[0];
    if (!item?.title) return null;
    return {
      product_name: item.title,
      brands: item.brand,
      generic_name: item.description,
      nutriments: {},
    };
  } catch {
    return null;
  }
}

const OFF_CACHE_TTL_MS = 5 * 60 * 1000;
const offLookupCache = new Map<string, { at: number; result: BarcodeLookupResult }>();
const offLookupInflight = new Map<string, Promise<BarcodeLookupResult>>();

function cacheLookup(result: BarcodeLookupResult, aliases: string[] = []) {
  const entry = { at: Date.now(), result };
  offLookupCache.set(result.code, entry);
  for (const a of aliases) {
    if (a) offLookupCache.set(a, entry);
  }
}

function cachedLookup(code: string): BarcodeLookupResult | null {
  const hit = offLookupCache.get(code);
  if (!hit) return null;
  if (Date.now() - hit.at > OFF_CACHE_TTL_MS) {
    offLookupCache.delete(code);
    return null;
  }
  return hit.result;
}

/** Look up a packaged product by barcode (OFF mirrors + upcitemdb, stub on miss). */
export async function lookupBarcodeProductDetailed(barcode: string): Promise<BarcodeLookupResult> {
  const variants = barcodeVariants(barcode);
  const primary = variants[0] || cleanBarcode(barcode);

  for (const code of variants) {
    const cached = cachedLookup(code);
    if (cached) return cached;
  }

  const inflightKey = primary || cleanBarcode(barcode);
  const existing = offLookupInflight.get(inflightKey);
  if (existing) return existing;

  const work = (async (): Promise<BarcodeLookupResult> => {
    for (const code of variants) {
      const hit = await fetchOffProduct(code);
      if (hit) {
        const result = {
          analysis: analysisFromOff(hit.product, code, hit.source),
          code,
          fromCatalog: true,
        } satisfies BarcodeLookupResult;
        cacheLookup(result, variants);
        return result;
      }
      const upc = await fetchUpcItemDb(code);
      if (upc) {
        const result = {
          analysis: analysisFromOff(upc, code, 'UPCitemdb'),
          code,
          fromCatalog: true,
        } satisfies BarcodeLookupResult;
        cacheLookup(result, variants);
        return result;
      }
    }

    const result: BarcodeLookupResult = {
      analysis: stubAnalysis(
        primary,
        undefined,
        `Barcode ${primary} · not in catalog - enter name & macros`,
      ),
      code: primary,
      fromCatalog: false,
    };
    cacheLookup(result, variants);
    return result;
  })();

  offLookupInflight.set(inflightKey, work);
  try {
    return await work;
  } finally {
    offLookupInflight.delete(inflightKey);
  }
}

/** Fire-and-forget OFF prefetch so "Found" → confirm feels instant. */
export function prefetchBarcodeLookup(barcode: string): void {
  const code = cleanBarcode(barcode);
  if (!isValidGtin(code)) return;
  if (cachedLookup(code)) return;
  void lookupBarcodeProductDetailed(code);
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
