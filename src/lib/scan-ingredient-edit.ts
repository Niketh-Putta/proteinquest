/** Shared handoff between scan result and the ingredient adjust screen. */

export type ScanIngredientEditAction = 'update' | 'delete' | 'add';

export type ScanIngredientEdit = {
  action?: ScanIngredientEditAction;
  index: number;
  name: string;
  portion: string;
  protein_g: number;
  calories_g: number;
  estimated_grams?: number;
};

export type AdjustQuantityMode = 'count' | 'size';
export type AdjustSize = 'small' | 'medium' | 'large';

export const ADJUST_SIZES: readonly AdjustSize[] = ['small', 'medium', 'large'] as const;

/** Multipliers vs the AI's estimated base (medium) portion. */
export const ADJUST_SIZE_SCALE: Record<AdjustSize, number> = {
  small: 0.7,
  medium: 1,
  large: 1.4,
};

const AMORPHOUS_KEYWORDS = [
  'chutney',
  'sauce',
  'gravy',
  'soup',
  'broth',
  'stew',
  'liquid',
  'milk',
  'juice',
  'dip',
  'dressing',
  'salsa',
  'pickle',
  'oil',
  'yogurt',
  'yoghurt',
  'raita',
  'cream',
  'butter',
  'honey',
  'syrup',
  'ketchup',
  'mayo',
  'mayonnaise',
  'aioli',
  'pesto',
  'relish',
  'jam',
  'spread',
  'paste',
  'vinaigrette',
  'puree',
  'purée',
  'bisque',
  'chowder',
  'consomme',
  'dal',
  'dahl',
  'sambar',
  'sambhar',
  'rasam',
  'curry',
  'curry sauce',
  'coconut milk',
  'condiment',
] as const;

/** Vessel portions (plate/bowl/cup) are size-based, not countable multiples. */
const SERVING_VESSEL_KEYWORDS = [
  'plate',
  'plates',
  'bowl',
  'bowls',
  'cup',
  'cups',
  'ladle',
  'ladles',
] as const;

const SERVING_VESSEL_RE =
  /\b(plates?|bowls?|cups?|ladles?|half[\s-]?plate)\b/i;

const COUNTABLE_KEYWORDS = [
  'slice',
  'slices',
  'piece',
  'pieces',
  'dosa',
  'dosas',
  'idli',
  'idlis',
  'egg',
  'eggs',
  'unit',
  'units',
  'whole',
  'pc',
  'pcs',
  'roti',
  'chapati',
  'paratha',
  'pancake',
  'waffle',
  'samosa',
  'vada',
  'burger',
  'sandwich',
  'taco',
  'wrap',
  'roll',
  'biscuit',
  'cookie',
  'scoop',
  'scoops',
  'bar',
  'bars',
  'patty',
  'patties',
  'wing',
  'wings',
  'nugget',
  'nuggets',
  'dumpling',
  'momos',
  'banana',
  'apple',
  'orange',
] as const;

const COUNTABLE_UNIT_RE =
  /\b(slices?|pieces?|units?|wholes?|eggs?|dosas?|idlis?|pcs?|scoops?)\b/i;
const WEIGHT_OR_VOLUME_RE =
  /^~?\d+(?:\.\d+)?\s*(g|grams?|kg|oz|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|cups?|tbsp|tsp|tablespoons?|teaspoons?)\b/i;
const LEADING_WEIGHT_RE = /^~?\d+(?:\.\d+)?\s*g\b/i;

let pending: ScanIngredientEdit | null = null;

export function setPendingIngredientEdit(edit: ScanIngredientEdit) {
  pending = edit;
}

export function consumePendingIngredientEdit(): ScanIngredientEdit | null {
  const next = pending;
  pending = null;
  return next;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textHasKeyword(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => {
    const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
    return re.test(lower);
  });
}

/** Leading quantity from a portion string, e.g. "2 large dosas" → 2. */
export function parsePortionQuantity(portion: string): { qty: number; rest: string } {
  const trimmed = portion.trim();
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { qty: 1, rest: trimmed };
  const qty = parseFloat(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return { qty: 1, rest: trimmed };
  return { qty, rest: (m[2] ?? '').trim() };
}

/** Infer Small/Medium/Large from an existing portion label. */
export function parsePortionSize(portion: string): AdjustSize {
  const lower = portion.toLowerCase();
  if (/\b(small|sm)\b/.test(lower)) return 'small';
  if (/\b(large|lg)\b/.test(lower)) return 'large';
  return 'medium';
}

/**
 * Countable foods keep a numeric wheel; sauces/liquids/amorphous use S/M/L.
 * Amorphous always wins (even if portion says scoop/piece). Vessel portions → size.
 */
export function resolveAdjustQuantityMode(name: string, portion: string): AdjustQuantityMode {
  const haystack = `${name} ${portion}`.trim();
  const portionTrimmed = portion.trim();

  // Stews/sauces/liquids: always S/M/L, never numeric (scoop/piece must not override).
  if (textHasKeyword(haystack, AMORPHOUS_KEYWORDS)) {
    return 'size';
  }

  if (
    SERVING_VESSEL_RE.test(portionTrimmed) ||
    textHasKeyword(haystack, SERVING_VESSEL_KEYWORDS)
  ) {
    return 'size';
  }

  if (WEIGHT_OR_VOLUME_RE.test(portionTrimmed) || LEADING_WEIGHT_RE.test(portionTrimmed)) {
    return 'size';
  }

  if (COUNTABLE_UNIT_RE.test(portionTrimmed) || textHasKeyword(haystack, COUNTABLE_KEYWORDS)) {
    return 'count';
  }

  // Generic leftovers (bare "1", "medium") stay numeric for countable-style foods.
  return 'count';
}

export function formatSizeLabel(size: AdjustSize): string {
  return size.charAt(0).toUpperCase() + size.slice(1);
}

export function buildSizePortion(size: AdjustSize, name: string): string {
  const label = formatSizeLabel(size);
  const base = name.trim() || 'serving';
  return `${label} ${base}`;
}

export function pluralizeFood(name: string, qty: number): string {
  const base = name.trim();
  if (!base) return qty === 1 ? 'serving' : 'servings';
  if (Math.abs(qty - 1) < 0.001) return base;
  if (/s$/i.test(base)) return base;
  if (/[^aeiou]y$/i.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

export function formatQuantityLabel(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(1).replace(/\.0$/, '');
}

const SAUCE_ADD_KEYWORDS = [
  'chutney',
  'sauce',
  'gravy',
  'dip',
  'dressing',
  'salsa',
  'pickle',
  'oil',
  'ketchup',
  'mayo',
  'mayonnaise',
  'aioli',
  'pesto',
  'relish',
  'jam',
  'spread',
  'paste',
  'vinaigrette',
  'condiment',
  'raita',
  'butter',
  'honey',
  'syrup',
  'cream',
] as const;

const LIQUID_BOWL_KEYWORDS = [
  'soup',
  'broth',
  'stew',
  'liquid',
  'milk',
  'juice',
  'yogurt',
  'yoghurt',
  'dal',
  'dahl',
  'sambar',
  'sambhar',
  'rasam',
  'curry',
  'bisque',
  'chowder',
  'consomme',
  'coconut milk',
  'puree',
  'purée',
] as const;

const VESSEL_MATCH_RE =
  /\b(bowls?|plates?|cups?|glasses?|scoops?|servings?|ladles?)\b/i;

const COUNT_UNIT_MATCH_RE = /\b(slices?|pieces?|scoops?)\b/i;

function normalizeVessel(raw: string): string {
  const lower = raw.toLowerCase();
  if (/^bowls?$/.test(lower)) return 'bowl';
  if (/^plates?$/.test(lower)) return 'plate';
  if (/^cups?$/.test(lower)) return 'cup';
  if (/^glasses?$/.test(lower)) return 'glass';
  if (/^scoops?$/.test(lower)) return 'scoop';
  if (/^servings?$/.test(lower)) return 'serving';
  if (/^ladles?$/.test(lower)) return 'ladle';
  return lower.replace(/s$/, '');
}

function detectVessel(portion: string): string | null {
  const m = portion.match(VESSEL_MATCH_RE);
  if (!m?.[1]) return null;
  return normalizeVessel(m[1]);
}

function detectCountUnit(haystack: string): 'slice' | 'piece' | 'scoop' | null {
  const m = haystack.match(COUNT_UNIT_MATCH_RE);
  if (!m?.[1]) return null;
  const raw = m[1].toLowerCase();
  if (/^slices?$/.test(raw)) return 'slice';
  if (/^pieces?$/.test(raw)) return 'piece';
  if (/^scoops?$/.test(raw)) return 'scoop';
  return null;
}

function foodLower(name: string): string {
  const base = name.trim().toLowerCase();
  return base || 'food';
}

/** Strip unit words so "bread slices" → "bread" for "slices of …" phrasing. */
function foodWithoutCountUnit(name: string): string {
  const cleaned = foodLower(name)
    .replace(/\b(slices?|pieces?|scoops?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || foodLower(name);
}

/**
 * Context-aware Adjust-screen question from ingredient name, portion, and mode.
 * Ends with ":" to match the picker UX.
 */
export function buildAdjustQuestion(
  name: string,
  portion: string,
  mode: AdjustQuantityMode,
): string {
  const food = foodLower(name);
  const haystack = `${name} ${portion}`.trim().toLowerCase();
  const vessel = detectVessel(portion);

  if (mode === 'size') {
    const isSauce = textHasKeyword(haystack, SAUCE_ADD_KEYWORDS);
    const isLiquid = textHasKeyword(haystack, LIQUID_BOWL_KEYWORDS);

    if (isSauce) {
      if (vessel && vessel !== 'serving') {
        return `How big a ${vessel} of ${food}:`;
      }
      return `How much ${food} did you add:`;
    }

    if (isLiquid) {
      const v = vessel && vessel !== 'serving' ? vessel : 'bowl';
      return `How big a ${v} of ${food} did you have:`;
    }

    if (vessel && vessel !== 'serving') {
      return `How big was the ${vessel} of ${food} you had:`;
    }

    return `How big a serving of ${food}:`;
  }

  // Count mode
  const unit = detectCountUnit(haystack);
  if (unit === 'slice' || unit === 'piece' || unit === 'scoop') {
    const ofFood = foodWithoutCountUnit(name);
    return `How many ${unit}s of ${ofFood} did you have:`;
  }

  if (/\bservings?\b/i.test(portion) && !/\bservings?\b/i.test(food)) {
    return `How many servings of ${food} did you have:`;
  }

  return `How many ${pluralizeFood(food, 2)} did you have:`;
}
