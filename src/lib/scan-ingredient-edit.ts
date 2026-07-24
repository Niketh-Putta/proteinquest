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

/** Multipliers vs the AI's estimated base (medium) portion. Kept for rare size fallback. */
export const ADJUST_SIZE_SCALE: Record<AdjustSize, number> = {
  small: 0.7,
  medium: 1,
  large: 1.4,
};

/** Units that always use a numeric count wheel (not Small/Medium/Large). */
const QUANTIFIABLE_MEASURES = new Set([
  'cup',
  'glass',
  'bowl',
  'plate',
  'ladle',
  'spoonful',
  'teaspoon',
  'tablespoon',
  'scoop',
  'slice',
  'piece',
  'stack',
  'spear',
  'stick',
  'handful',
  'floret',
  'bar',
  'bottle',
  'can',
  'carton',
  'pot',
  'tub',
  'jar',
  'pack',
  'pouch',
  'sachet',
  'muffin',
  'cookie',
  'brownie',
  'wrap',
  'sandwich',
  'burrito',
  'taco',
  'piece',
]);

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
  /\b(slices?|pieces?|units?|wholes?|eggs?|dosas?|idlis?|pcs?|scoops?|bars?|bottles?|cans?|cartons?|pots?|tubs?|jars?|packs?|pouches?|sachets?|muffins?|cookies?|brownies?|wraps?|sandwiches?|burritos?|tacos?)\b/i;
const WEIGHT_OR_VOLUME_RE =
  /^~?\d+(?:\.\d+)?\s*(g|grams?|kg|oz|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|cups?|tbsp|tsp|tablespoons?|teaspoons?)\b/i;
const LEADING_WEIGHT_RE = /^~?\d+(?:\.\d+)?\s*g\b/i;

/** Cooked grains / cereal people measure in cups (not "servings"). */
const CUP_GRAIN_KEYWORDS = [
  'quinoa',
  'cereal',
  'muesli',
  'granola',
  'couscous',
  'bulgur',
  'farro',
  'barley',
  'millet',
  'polenta',
  'grits',
  'congee',
  'risotto',
] as const;

/** Dairy / soft foods usually measured in spoonfuls (bowl if portion says bowl). */
const SPOONFUL_FOOD_KEYWORDS = [
  'curd',
  'yogurt',
  'yoghurt',
  'raita',
  'cream',
  'sour cream',
  'sugar',
  'honey',
  'jam',
  'jelly',
  'butter',
  'nutella',
] as const;

/** Scoops: powders and scooped desserts. */
const SCOOP_FOOD_KEYWORDS = [
  'protein powder',
  'whey',
  'whey isolate',
  'whey concentrate',
  'clear whey',
  'casein',
  'isolate',
  'creatine',
  'pre-workout',
  'preworkout',
  'mass gainer',
  'collagen',
  'ice cream',
  'gelato',
  'sorbet',
  'frozen yogurt',
  'impact whey',
  'gold standard',
] as const;

/** Oils, sauces, nut butters → tablespoons. */
const TABLESPOON_FOOD_KEYWORDS = [
  'oil',
  'olive oil',
  'dressing',
  'vinaigrette',
  'sauce',
  'gravy',
  'ketchup',
  'mayo',
  'mayonnaise',
  'aioli',
  'pesto',
  'peanut butter',
  'almond butter',
  'cashew butter',
  'nut butter',
  'tahini',
] as const;

/** Drinks → cups/glasses (bottled RTDs use portion "1 bottle" instead). */
const DRINK_KEYWORDS = [
  'milk',
  'juice',
  'water',
  'coffee',
  'tea',
  'latte',
  'smoothie',
  'shake',
  'lassi',
  'buttermilk',
  'coconut milk',
  'protein shake',
  'protein drink',
] as const;

/** Stews / dals / rice / oatmeal → bowls. */
const BOWL_FOOD_KEYWORDS = [
  'soup',
  'broth',
  'stew',
  'dal',
  'dahl',
  'sambar',
  'sambhar',
  'rasam',
  'curry',
  'bisque',
  'chowder',
  'consomme',
  'chili',
  'chilli',
  'rice',
  'basmati',
  'jasmine',
  'oats',
  'oatmeal',
  'porridge',
] as const;

const OIL_DRESSING_KEYWORDS = [
  'oil',
  'olive oil',
  'dressing',
  'vinaigrette',
] as const;

const SALAD_KEYWORDS = ['salad', 'slaw', 'coleslaw'] as const;

/** Sliced meats, bread, cheese, pizza… → "how many slices" (not whole chicken breasts). */
const SLICE_FOOD_KEYWORDS = [
  'beef',
  'roast beef',
  'steak',
  'brisket',
  'pastrami',
  'salami',
  'ham',
  'turkey',
  'bacon',
  'pork',
  'lamb',
  'prosciutto',
  'chorizo',
  'pepperoni',
  'bologna',
  'sausage',
  'meat',
  'bread',
  'toast',
  'bagel',
  'cheese',
  'pizza',
  'cake',
  'pie',
  'watermelon',
  'melon',
] as const;

/** Stacked flat foods → "how many stacks" / pancakes as stacks. */
const STACK_FOOD_KEYWORDS = [
  'pancake',
  'pancakes',
  'waffle',
  'waffles',
  'cookie',
  'cookies',
  'biscuit',
  'biscuits',
  'cracker',
  'crackers',
  'chip',
  'chips',
  'nacho',
  'nachos',
] as const;

/** Discrete chunks people count as pieces. */
const PIECE_FOOD_KEYWORDS = [
  'chicken',
  'wing',
  'wings',
  'nugget',
  'nuggets',
  'drumstick',
  'thigh',
  'tender',
  'fish',
  'shrimp',
  'prawn',
  'meatball',
  'dumpling',
  'dumplings',
  'momo',
  'momos',
  'tofu',
  'paneer',
] as const;

type SpecificCountStyle = 'suffix' | 'of';

/**
 * Produce / snack units preferred over lazy "servings".
 * Longer keywords win (e.g. cherry tomato before cherry).
 * style 'suffix' → "asparagus spears"; 'of' → "handfuls of grapes".
 */
const SPECIFIC_COUNT_FOODS: readonly {
  keywords: readonly string[];
  unit: string;
  style: SpecificCountStyle;
}[] = [
  { keywords: ['asparagus'], unit: 'spear', style: 'suffix' },
  { keywords: ['celery stick', 'celery sticks', 'celery'], unit: 'stick', style: 'suffix' },
  { keywords: ['carrot stick', 'carrot sticks'], unit: 'stick', style: 'suffix' },
  {
    keywords: [
      'brussels sprout',
      'brussels sprouts',
      'brussel sprout',
      'brussel sprouts',
    ],
    unit: 'piece',
    style: 'of',
  },
  { keywords: ['cherry tomato', 'cherry tomatoes'], unit: 'piece', style: 'of' },
  { keywords: ['baby carrot', 'baby carrots'], unit: 'piece', style: 'of' },
  { keywords: ['grape', 'grapes'], unit: 'handful', style: 'of' },
  { keywords: ['strawberry', 'strawberries'], unit: 'piece', style: 'of' },
  { keywords: ['blueberry', 'blueberries'], unit: 'handful', style: 'of' },
  { keywords: ['raspberry', 'raspberries'], unit: 'handful', style: 'of' },
  { keywords: ['blackberry', 'blackberries'], unit: 'handful', style: 'of' },
  { keywords: ['cherry', 'cherries'], unit: 'handful', style: 'of' },
  { keywords: ['broccoli'], unit: 'floret', style: 'of' },
  { keywords: ['cauliflower'], unit: 'floret', style: 'of' },
  {
    keywords: ['green bean', 'green beans', 'french bean', 'french beans'],
    unit: 'handful',
    style: 'of',
  },
  { keywords: ['mushroom', 'mushrooms'], unit: 'piece', style: 'of' },
  { keywords: ['olive', 'olives'], unit: 'piece', style: 'of' },
  { keywords: ['radish', 'radishes'], unit: 'piece', style: 'of' },
];

/**
 * Whole items → "how many whole X" (chicken breasts, eggs, fruit, bars).
 * Checked before piece/slice so "chicken breast" is never "slices".
 */
const WHOLE_ITEM_KEYWORDS = [
  'chicken breast',
  'chicken breasts',
  'egg',
  'eggs',
  'banana',
  'bananas',
  'apple',
  'apples',
  'orange',
  'oranges',
  'protein bar',
  'protein bars',
  'chocolate bar',
  'chocolate bars',
  'bar',
  'bars',
  'cookie',
  'cookies',
  'muffin',
  'muffins',
  'brownie',
  'brownies',
  'flapjack',
  'flapjacks',
] as const;

/** Other countable foods → "how many dosas/burgers" (no "whole" prefix). */
const WHOLE_COUNT_KEYWORDS = [
  'egg',
  'eggs',
  'dosa',
  'dosas',
  'idli',
  'idlis',
  'roti',
  'chapati',
  'paratha',
  'samosa',
  'vada',
  'burger',
  'sandwich',
  'taco',
  'wrap',
  'roll',
  'bar',
  'bars',
  'patty',
  'patties',
  'banana',
  'apple',
  'orange',
  'chicken breast',
  'chicken breasts',
] as const;

const EMBEDDED_COUNT_UNIT_RE =
  /(\d+(?:\.\d+)?)\s*(cups?|glass(?:es)?|servings?|bowls?|plates?|scoops?|slices?|pieces?|stacks?|spears?|sticks?|handfuls?|florets?|spoonfuls?|spoons?|tbsp|tsp|tablespoons?|teaspoons?|bars?|bottles?|cans?|cartons?|pots?|tubs?|jars?|packs?|pouches?|sachets?|muffins?|cookies?|brownies?|wraps?|sandwiches?|burritos?|tacos?)\b/i;

/** Measuring units shown on the count wheel (not the food name itself). */
const MEASURE_UNITS = new Set([
  'cup',
  'glass',
  'bowl',
  'plate',
  'ladle',
  'scoop',
  'slice',
  'piece',
  'stack',
  'spoonful',
  'teaspoon',
  'tablespoon',
  'drizzle',
  'spear',
  'stick',
  'handful',
  'floret',
  'bar',
  'bottle',
  'can',
  'carton',
  'pot',
  'tub',
  'jar',
  'pack',
  'pouch',
  'sachet',
  'muffin',
  'cookie',
  'brownie',
  'wrap',
  'sandwich',
  'burrito',
  'taco',
]);

let pending: ScanIngredientEdit | null = null;

/** Stack of appliers from mounted scan/meal owners (top = active). */
type IngredientEditApplier = (edit: ScanIngredientEdit) => void;
const appliers: IngredientEditApplier[] = [];

export function setPendingIngredientEdit(edit: ScanIngredientEdit) {
  pending = edit;
}

export function consumePendingIngredientEdit(): ScanIngredientEdit | null {
  const next = pending;
  pending = null;
  return next;
}

/**
 * Register the screen that owns the ingredients list (scan result / meal detail).
 * Returns an unregister function for useEffect cleanup.
 */
export function registerIngredientEditApplier(fn: IngredientEditApplier): () => void {
  appliers.push(fn);
  return () => {
    const i = appliers.lastIndexOf(fn);
    if (i >= 0) appliers.splice(i, 1);
  };
}

/**
 * Apply the latest pending edit immediately via the topmost owner.
 * Prefer this over useFocusEffect alone — web/modal stacks often do not re-fire focus
 * when returning from scan-adjust, so the list would stay stale.
 */
export function flushPendingIngredientEdit(): boolean {
  const edit = pending;
  if (!edit) return false;
  const applier = appliers[appliers.length - 1];
  if (!applier) return false;
  pending = null;
  applier(edit);
  return true;
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
  if (m) {
    const qty = parseFloat(m[1]);
    if (Number.isFinite(qty) && qty > 0) {
      return { qty, rest: (m[2] ?? '').trim() };
    }
  }
  // Compound labels like "~150g • 1.5 serving"
  const embedded = trimmed.match(EMBEDDED_COUNT_UNIT_RE);
  if (embedded) {
    const qty = parseFloat(embedded[1]);
    if (Number.isFinite(qty) && qty > 0) {
      return { qty, rest: embedded[2] };
    }
  }
  return { qty: 1, rest: trimmed };
}

function isCupGrain(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), CUP_GRAIN_KEYWORDS);
}

function isSpoonfulFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), SPOONFUL_FOOD_KEYWORDS);
}

function isScoopFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), SCOOP_FOOD_KEYWORDS);
}

function isTablespoonFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), TABLESPOON_FOOD_KEYWORDS);
}

function isDrinkFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), DRINK_KEYWORDS);
}

function isBowlFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), BOWL_FOOD_KEYWORDS);
}

function isOilDressing(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), OIL_DRESSING_KEYWORDS);
}

function isSaladFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), SALAD_KEYWORDS);
}

function isSliceFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), SLICE_FOOD_KEYWORDS);
}

function isStackFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), STACK_FOOD_KEYWORDS);
}

function isPieceFood(name: string, portion = ''): boolean {
  // Whole chicken breasts are countable wholes, not "pieces of chicken".
  if (isWholeItemFood(name, portion)) return false;
  return textHasKeyword(`${name} ${portion}`.trim(), PIECE_FOOD_KEYWORDS);
}

function isWholeItemFood(name: string, portion = ''): boolean {
  // Avoid "whole oranges" for orange juice / smoothies.
  if (isDrinkFood(name, portion)) return false;
  return textHasKeyword(`${name} ${portion}`.trim(), WHOLE_ITEM_KEYWORDS);
}

function isWholeCountableFood(name: string, portion = ''): boolean {
  return textHasKeyword(`${name} ${portion}`.trim(), WHOLE_COUNT_KEYWORDS);
}

/** Match produce/snack-specific units; longest keyword wins. */
function resolveSpecificCountFood(
  name: string,
  portion = '',
): { unit: string; style: SpecificCountStyle } | null {
  const haystack = `${name} ${portion}`.trim().toLowerCase();
  let best: { unit: string; style: SpecificCountStyle; len: number } | null = null;
  for (const spec of SPECIFIC_COUNT_FOODS) {
    for (const keyword of spec.keywords) {
      const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
      if (!re.test(haystack)) continue;
      if (!best || keyword.length > best.len) {
        best = { unit: spec.unit, style: spec.style, len: keyword.length };
      }
    }
  }
  return best ? { unit: best.unit, style: best.style } : null;
}

/** Strip cooking notes like "(steamed)" for cleaner questions. */
function foodDisplayName(name: string): string {
  const cleaned = foodLower(name)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || foodLower(name);
}

/** Drop unit words from the food label ("celery sticks" + stick → "celery"). */
function foodBaseForUnit(name: string, unit: string): string {
  const unitRe = new RegExp(`\\b${escapeRegExp(unit)}s?\\b`, 'gi');
  const cleaned = foodDisplayName(name).replace(unitRe, '').replace(/\s+/g, ' ').trim();
  return cleaned || foodDisplayName(name);
}

function isWeightOnlyPortion(portion: string): boolean {
  const trimmed = portion.trim();
  if (!trimmed) return false;
  if (EMBEDDED_COUNT_UNIT_RE.test(trimmed)) return false;
  return WEIGHT_OR_VOLUME_RE.test(trimmed) || LEADING_WEIGHT_RE.test(trimmed);
}

/**
 * Natural measuring unit from portion clues + food heuristics (singular).
 * Prefer portion string units (cup, tbsp, bowl, …) when present.
 */
export function resolveNaturalMeasureUnit(
  name: string,
  portion: string,
): string | null {
  const clue = detectPortionUnitClue(`${portion} ${name}`);
  if (clue && clue !== 'serving') return clue;

  // Produce/snack-specific units beat vague "servings".
  const specific = resolveSpecificCountFood(name, portion);
  if (specific) return specific.unit;

  // Whole items use the food name on the wheel (not slice/piece).
  if (isWholeItemFood(name, portion)) return null;

  if (isScoopFood(name, portion)) return 'scoop';
  if (isDrinkFood(name, portion)) return 'glass';
  if (isBowlFood(name, portion)) return 'bowl';
  if (isTablespoonFood(name, portion) || isOilDressing(name, portion)) return 'tablespoon';
  if (isCupGrain(name, portion)) return 'cup';
  if (isSpoonfulFood(name, portion)) return 'spoonful';
  if (isSaladFood(name, portion)) return 'bowl';
  if (isSliceFood(name, portion)) return 'slice';
  if (isStackFood(name, portion)) return 'stack';
  if (isPieceFood(name, portion)) return 'piece';
  // Sauces / amorphous leftovers → tablespoons (quantifiable), not vague Small/Medium/Large.
  if (textHasKeyword(`${name} ${portion}`.trim(), AMORPHOUS_KEYWORDS)) return 'tablespoon';
  return null;
}

/**
 * Count-wheel unit label (singular). Uses natural measures (cups, spoonfuls)
 * instead of generic "serving" when heuristics match.
 */
export function resolveAdjustCountUnit(name: string, portion: string): string {
  const haystack = `${name} ${portion}`.trim().toLowerCase();
  // Explicit "N serving(s)" wins over food heuristics (e.g. chicken → piece).
  if (/^~?\d+(?:\.\d+)?\s*servings?\s*$/i.test(portion.trim())) return 'serving';

  const countUnit = detectCountUnit(haystack);
  if (countUnit) return countUnit;

  const natural = resolveNaturalMeasureUnit(name, portion);
  if (natural && natural !== 'drizzle') return natural;

  // Whole items: wheel unit is the food itself (not "medium" from "1 medium banana").
  if (isWholeItemFood(name, portion)) {
    return foodLower(name);
  }

  const vessel = detectVessel(portion);
  if (vessel && vessel !== 'serving') return vessel;

  const { rest } = parsePortionQuantity(portion);
  const restClean = rest
    .replace(/^~?\d+(?:\.\d+)?\s*(g|grams?|kg|oz|ml)\b/i, '')
    .replace(/\b(small|medium|large|sm|md|lg)\b/gi, '')
    .replace(/[•|,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (restClean && !isWeightOnlyPortion(restClean) && !/^servings?$/i.test(restClean)) {
    const restVessel = detectVessel(restClean);
    if (restVessel && restVessel !== 'serving') return restVessel;
    if (!/^~?\d/.test(restClean) && !MEASURE_UNITS.has(restClean.replace(/s$/i, ''))) {
      return restClean.replace(/s$/i, '') || restClean;
    }
  }

  return foodLower(name);
}

export function formatCountUnitLabel(unit: string, qty: number): string {
  const base = unit.trim() || 'serving';
  const singular = Math.abs(qty - 1) < 0.001;
  if (/^glass(?:es)?$/i.test(base)) return singular ? 'glass' : 'glasses';
  if (/^spoonfuls?$/i.test(base)) return singular ? 'spoonful' : 'spoonfuls';
  if (/^tablespoons?$/i.test(base)) return singular ? 'tablespoon' : 'tablespoons';
  if (/^teaspoons?$/i.test(base)) return singular ? 'teaspoon' : 'teaspoons';
  if (/^slices?$/i.test(base)) return singular ? 'slice' : 'slices';
  if (/^pieces?$/i.test(base)) return singular ? 'piece' : 'pieces';
  if (/^stacks?$/i.test(base)) return singular ? 'stack' : 'stacks';
  if (/^drizzles?$/i.test(base)) return singular ? 'drizzle' : 'drizzles';
  if (/^spears?$/i.test(base)) return singular ? 'spear' : 'spears';
  if (/^sticks?$/i.test(base)) return singular ? 'stick' : 'sticks';
  if (/^handfuls?$/i.test(base)) return singular ? 'handful' : 'handfuls';
  if (/^florets?$/i.test(base)) return singular ? 'floret' : 'florets';
  if (/^scoops?$/i.test(base)) return singular ? 'scoop' : 'scoops';
  if (/^bars?$/i.test(base)) return singular ? 'bar' : 'bars';
  if (/^bottles?$/i.test(base)) return singular ? 'bottle' : 'bottles';
  if (/^cans?$/i.test(base)) return singular ? 'can' : 'cans';
  if (/^cartons?$/i.test(base)) return singular ? 'carton' : 'cartons';
  if (/^pots?$/i.test(base)) return singular ? 'pot' : 'pots';
  if (/^tubs?$/i.test(base)) return singular ? 'tub' : 'tubs';
  if (/^jars?$/i.test(base)) return singular ? 'jar' : 'jars';
  if (/^packs?$/i.test(base)) return singular ? 'pack' : 'packs';
  if (/^pouches?$/i.test(base)) return singular ? 'pouch' : 'pouches';
  if (/^sachets?$/i.test(base)) return singular ? 'sachet' : 'sachets';
  if (/^muffins?$/i.test(base)) return singular ? 'muffin' : 'muffins';
  if (/^cookies?$/i.test(base)) return singular ? 'cookie' : 'cookies';
  if (/^brownies?$/i.test(base)) return singular ? 'brownie' : 'brownies';
  if (/^wraps?$/i.test(base)) return singular ? 'wrap' : 'wraps';
  if (/^sandwiches?$/i.test(base)) return singular ? 'sandwich' : 'sandwiches';
  if (/^burritos?$/i.test(base)) return singular ? 'burrito' : 'burritos';
  if (/^tacos?$/i.test(base)) return singular ? 'taco' : 'tacos';
  if (singular) {
    if (/s$/i.test(base) && !/ss$/i.test(base)) return base.replace(/s$/i, '');
    return base;
  }
  if (/s$/i.test(base)) return base;
  if (/[^aeiou]y$/i.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** Wheel / summary label for count mode (prefers cups/spoonfuls over "serving"). */
export function formatAdjustWheelUnit(name: string, portion: string, qty: number): string {
  const unit = resolveAdjustCountUnit(name, portion);
  if (MEASURE_UNITS.has(unit) || unit === 'serving') {
    return formatCountUnitLabel(unit === 'serving' ? foodLower(name) : unit, qty);
  }
  const { rest } = parsePortionQuantity(portion);
  if (rest && !/^servings?$/i.test(rest.trim()) && !isWeightOnlyPortion(rest)) {
    return rest;
  }
  return formatCountUnitLabel(unit, qty);
}

/** Infer Small/Medium/Large from an existing portion label. */
export function parsePortionSize(portion: string): AdjustSize {
  const lower = portion.toLowerCase();
  if (/\b(small|sm)\b/.test(lower)) return 'small';
  if (/\b(large|lg)\b/.test(lower)) return 'large';
  return 'medium';
}

/**
 * Prefer a numeric wheel with real units (cups, tbsp, bowls, spoonfuls).
 * Small/Medium/Large only when nothing quantifiable can be inferred.
 */
export function resolveAdjustQuantityMode(name: string, portion: string): AdjustQuantityMode {
  const haystack = `${name} ${portion}`.trim();
  const portionTrimmed = portion.trim();

  const natural = resolveNaturalMeasureUnit(name, portion);
  if (natural && QUANTIFIABLE_MEASURES.has(natural)) {
    return 'count';
  }

  if (COUNTABLE_UNIT_RE.test(portionTrimmed) || textHasKeyword(haystack, COUNTABLE_KEYWORDS)) {
    return 'count';
  }

  // Explicit vessel words without a food heuristic still → count of that vessel.
  if (
    SERVING_VESSEL_RE.test(portionTrimmed) ||
    textHasKeyword(haystack, SERVING_VESSEL_KEYWORDS)
  ) {
    return 'count';
  }

  // Weight-only labels with no unit clue: still allow gram editing; wheel uses spoonfuls.
  if (WEIGHT_OR_VOLUME_RE.test(portionTrimmed) || LEADING_WEIGHT_RE.test(portionTrimmed)) {
    return 'count';
  }

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
  // Keep quarter steps readable (0.25 / 0.5 / 0.75), not 0.25 → "0.3".
  const quarters = Math.round(qty * 4) / 4;
  if (Math.abs(qty - quarters) < 0.001) {
    return String(quarters);
  }
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

const VESSEL_MATCH_RE =
  /\b(bowls?|plates?|cups?|glass(?:es)?|scoops?|servings?|ladles?|spoonfuls?|spoons?|tbsp|tsp|tablespoons?|teaspoons?|drizzle|bars?|bottles?|cans?|cartons?|pots?|tubs?|jars?|packs?|pouches?|sachets?|muffins?|cookies?|brownies?|wraps?|sandwiches?|burritos?|tacos?)\b/i;

const COUNT_UNIT_MATCH_RE =
  /\b(slices?|pieces?|scoops?|stacks?|spears?|sticks?|handfuls?|florets?|bars?|bottles?|cans?|cartons?|pots?|tubs?|jars?|packs?|pouches?|sachets?|muffins?|cookies?|brownies?|wraps?|sandwiches?|burritos?|tacos?)\b/i;

const PORTION_UNIT_CLUE_RE =
  /\b(cups?|glass(?:es)?|bowls?|plates?|ladles?|scoops?|slices?|pieces?|stacks?|spears?|sticks?|handfuls?|florets?|spoonfuls?|spoons?|tbsp|tablespoons?|tsp|teaspoons?|drizzle|servings?|bars?|bottles?|cans?|cartons?|pots?|tubs?|jars?|packs?|pouches?|sachets?|muffins?|cookies?|brownies?|wraps?|sandwiches?|burritos?|tacos?)\b/i;

function normalizeMeasureUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (/^bowls?$/.test(lower)) return 'bowl';
  if (/^plates?$/.test(lower)) return 'plate';
  if (/^cups?$/.test(lower)) return 'cup';
  if (/^glass(?:es)?$/.test(lower)) return 'glass';
  if (/^scoops?$/.test(lower)) return 'scoop';
  if (/^slices?$/.test(lower)) return 'slice';
  if (/^pieces?$/.test(lower)) return 'piece';
  if (/^stacks?$/.test(lower)) return 'stack';
  if (/^spears?$/.test(lower)) return 'spear';
  if (/^sticks?$/.test(lower)) return 'stick';
  if (/^handfuls?$/.test(lower)) return 'handful';
  if (/^florets?$/.test(lower)) return 'floret';
  if (/^servings?$/.test(lower)) return 'serving';
  if (/^ladles?$/.test(lower)) return 'ladle';
  if (/^(spoonfuls?|spoons?)$/.test(lower)) return 'spoonful';
  if (/^(tbsp|tablespoons?)$/.test(lower)) return 'tablespoon';
  if (/^(tsp|teaspoons?)$/.test(lower)) return 'teaspoon';
  if (/^drizzle$/.test(lower)) return 'drizzle';
  if (/^bars?$/.test(lower)) return 'bar';
  if (/^bottles?$/.test(lower)) return 'bottle';
  if (/^cans?$/.test(lower)) return 'can';
  if (/^cartons?$/.test(lower)) return 'carton';
  if (/^pots?$/.test(lower)) return 'pot';
  if (/^tubs?$/.test(lower)) return 'tub';
  if (/^jars?$/.test(lower)) return 'jar';
  if (/^packs?$/.test(lower)) return 'pack';
  if (/^pouches?$/.test(lower)) return 'pouch';
  if (/^sachets?$/.test(lower)) return 'sachet';
  if (/^muffins?$/.test(lower)) return 'muffin';
  if (/^cookies?$/.test(lower)) return 'cookie';
  if (/^brownies?$/.test(lower)) return 'brownie';
  if (/^wraps?$/.test(lower)) return 'wrap';
  if (/^sandwiches?$/.test(lower)) return 'sandwich';
  if (/^burritos?$/.test(lower)) return 'burrito';
  if (/^tacos?$/.test(lower)) return 'taco';
  return lower.replace(/s$/, '');
}

function normalizeVessel(raw: string): string {
  return normalizeMeasureUnit(raw);
}

function detectVessel(portion: string): string | null {
  const m = portion.match(VESSEL_MATCH_RE);
  if (!m?.[1]) return null;
  return normalizeVessel(m[1]);
}

/** Prefer explicit portion units (cup, tbsp, bowl, glass, …). */
function detectPortionUnitClue(text: string): string | null {
  const m = text.match(PORTION_UNIT_CLUE_RE);
  if (!m?.[1]) return null;
  return normalizeMeasureUnit(m[1]);
}

function detectCountUnit(haystack: string): string | null {
  const m = haystack.match(COUNT_UNIT_MATCH_RE);
  if (!m?.[1]) return null;
  return normalizeMeasureUnit(m[1]);
}

function foodLower(name: string): string {
  const base = name.trim().toLowerCase();
  return base || 'food';
}

/** Strip unit words so "bread slices" → "bread" for "slices of …" phrasing. */
function foodWithoutCountUnit(name: string): string {
  const cleaned = foodDisplayName(name)
    .replace(
      /\b(slices?|pieces?|stacks?|scoops?|spears?|sticks?|handfuls?|florets?|cups?|bowls?|plates?|glass(?:es)?|spoonfuls?|spoons?|tablespoons?|teaspoons?|tbsp|tsp|servings?|bars?|bottles?|cans?|cartons?|pots?|tubs?|jars?|packs?|pouches?|sachets?|muffins?|cookies?|brownies?|wraps?|sandwiches?|burritos?|tacos?)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || foodDisplayName(name);
}

function pluralMeasureUnit(unit: string): string {
  return formatCountUnitLabel(unit, 2);
}

/**
 * Context-aware Adjust-screen question from ingredient name, portion, and mode.
 * Uses specific units (cups, spoonfuls, bowls…) instead of generic "servings".
 * Ends with ":" to match the picker UX.
 */
export function buildAdjustQuestion(
  name: string,
  portion: string,
  mode: AdjustQuantityMode,
): string {
  const food = foodDisplayName(name);
  const haystack = `${name} ${portion}`.trim().toLowerCase();
  const clue = detectPortionUnitClue(portion);
  const natural = resolveNaturalMeasureUnit(name, portion);
  const specific = resolveSpecificCountFood(name, portion);

  const isSauce = textHasKeyword(haystack, SAUCE_ADD_KEYWORDS);
  const verb = isSauce || isOilDressing(name, portion) ? 'add' : 'have';
  const measure = clue && clue !== 'serving' ? clue : natural;

  // Size mode kept as rare fallback (quantifiable count is preferred).
  if (mode === 'size') {
    if (measure && measure !== 'serving') {
      return `How many ${pluralMeasureUnit(measure)} of ${food} did you ${verb}:`;
    }
    return `How many servings of ${food} did you ${verb}:`;
  }

  // Produce/snack-specific units (asparagus spears, celery sticks, grape handfuls…).
  if (specific) {
    const unitPlural = pluralMeasureUnit(specific.unit);
    const base = foodBaseForUnit(name, specific.unit);
    if (specific.style === 'suffix') {
      return `How many ${base} ${unitPlural} did you ${verb}:`;
    }
    return `How many ${unitPlural} of ${base} did you ${verb}:`;
  }

  // Count mode — real units (tbsp, cups, glasses, bowls, scoops, slices…)
  const countUnit = detectCountUnit(haystack);
  if (countUnit) {
    const ofFood = foodWithoutCountUnit(name);
    return `How many ${pluralMeasureUnit(countUnit)} of ${ofFood} did you ${verb}:`;
  }

  if (measure && MEASURE_UNITS.has(measure)) {
    const ofFood = foodWithoutCountUnit(name);
    return `How many ${pluralMeasureUnit(measure)} of ${ofFood} did you ${verb}:`;
  }

  // Whole items (chicken breast, egg, banana, bars…) before piece/slice heuristics.
  if (isWholeItemFood(name, portion)) {
    return `How many whole ${pluralizeFood(food, 2)} did you ${verb}:`;
  }

  // Prefer inferred slices/stacks/pieces over awkward plurals ("beefs").
  if (isSliceFood(name, portion)) {
    return `How many slices of ${food} did you ${verb}:`;
  }
  if (isStackFood(name, portion)) {
    return `How many stacks of ${food} did you ${verb}:`;
  }
  if (isPieceFood(name, portion)) {
    return `How many pieces of ${food} did you ${verb}:`;
  }

  if (isWholeCountableFood(name, portion) || textHasKeyword(haystack, COUNTABLE_KEYWORDS)) {
    return `How many ${pluralizeFood(food, 2)} did you ${verb}:`;
  }

  if (COUNTABLE_UNIT_RE.test(portion)) {
    return `How many ${pluralizeFood(food, 2)} did you ${verb}:`;
  }

  if (natural && MEASURE_UNITS.has(natural)) {
    return `How many ${pluralMeasureUnit(natural)} of ${food} did you ${verb}:`;
  }

  return `How many servings of ${food} did you ${verb}:`;
}
