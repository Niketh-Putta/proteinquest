/** Cooked edible weight protein density (g per 100g). USDA-aligned anchors for calibration. */
export interface DensityEntry {
  keywords: string[];
  proteinPer100g: number;
  /** Cooked edible kcal per 100g — used when the model omits calories. */
  kcalPer100g: number;
}

export const PROTEIN_DENSITY_TABLE: DensityEntry[] = [
  { keywords: ['chicken breast', 'grilled chicken', 'chicken strip', 'chicken slice', 'shredded chicken'], proteinPer100g: 31, kcalPer100g: 165 },
  { keywords: ['chicken thigh', 'dark meat chicken'], proteinPer100g: 26, kcalPer100g: 209 },
  { keywords: ['chicken wing', 'chicken drumstick'], proteinPer100g: 27, kcalPer100g: 203 },
  { keywords: ['chicken tikka', 'tandoori chicken', 'chicken curry'], proteinPer100g: 28, kcalPer100g: 190 },
  { keywords: ['ground beef', 'beef patty', 'steak', 'beef'], proteinPer100g: 26, kcalPer100g: 250 },
  { keywords: ['pork chop', 'pork tenderloin', 'pork loin'], proteinPer100g: 27, kcalPer100g: 242 },
  { keywords: ['salmon', 'tuna', 'cod', 'fish fillet', 'grilled fish'], proteinPer100g: 25, kcalPer100g: 206 },
  { keywords: ['shrimp', 'prawn', 'prawns', 'gongura prawn', 'prawn curry', 'shrimp curry'], proteinPer100g: 24, kcalPer100g: 99 },
  { keywords: ['mutton', 'lamb', 'goat meat'], proteinPer100g: 25, kcalPer100g: 294 },
  { keywords: ['egg white', 'egg whites'], proteinPer100g: 11, kcalPer100g: 52 },
  { keywords: ['egg', 'fried egg', 'scrambled egg', 'boiled egg', 'poached egg'], proteinPer100g: 13, kcalPer100g: 155 },
  { keywords: ['paneer', 'cottage cheese indian'], proteinPer100g: 18, kcalPer100g: 265 },
  { keywords: ['tofu', 'tempeh'], proteinPer100g: 17, kcalPer100g: 76 },
  { keywords: ['greek yogurt', 'skyr'], proteinPer100g: 10, kcalPer100g: 97 },
  { keywords: ['yogurt', 'curd'], proteinPer100g: 3.5, kcalPer100g: 61 },
  { keywords: ['cottage cheese', 'ricotta'], proteinPer100g: 11, kcalPer100g: 98 },
  { keywords: ['cheddar', 'mozzarella', 'parmesan', 'cheese'], proteinPer100g: 25, kcalPer100g: 402 },
  { keywords: ['protein shake', 'protein powder', 'whey'], proteinPer100g: 80, kcalPer100g: 400 },
  { keywords: ['protein bar', 'energy bar'], proteinPer100g: 30, kcalPer100g: 350 },
  { keywords: ['sambar', 'rasam'], proteinPer100g: 3.5, kcalPer100g: 55 },
  { keywords: ['dal', 'daal', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'chana', 'bean', 'beans'], proteinPer100g: 9, kcalPer100g: 116 },
  { keywords: ['idli'], proteinPer100g: 3.5, kcalPer100g: 120 },
  { keywords: ['dosa', 'uttapam'], proteinPer100g: 4, kcalPer100g: 170 },
  { keywords: ['roti', 'chapati', 'chapathi', 'phulka'], proteinPer100g: 8, kcalPer100g: 297 },
  { keywords: ['naan', 'paratha'], proteinPer100g: 9, kcalPer100g: 310 },
  { keywords: ['biryani', 'pulao', 'pilaf'], proteinPer100g: 7, kcalPer100g: 170 },
  { keywords: ['gongura pachadi', 'gongura curry', 'gongura', 'sorrel'], proteinPer100g: 3, kcalPer100g: 90 },
  { keywords: ['palak', 'methi', 'fenugreek leaves', 'kale', 'spinach', 'broccoli', 'greens', 'salad greens', 'sabzi', 'vegetable curry'], proteinPer100g: 3, kcalPer100g: 45 },
  { keywords: ['rice', 'white rice', 'brown rice', 'jeera rice', 'steamed rice'], proteinPer100g: 2.7, kcalPer100g: 130 },
  { keywords: ['pasta', 'noodle', 'noodles'], proteinPer100g: 5, kcalPer100g: 131 },
  { keywords: ['bread', 'toast', 'bun', 'roll'], proteinPer100g: 9, kcalPer100g: 265 },
  { keywords: ['pizza'], proteinPer100g: 12, kcalPer100g: 266 },
  { keywords: ['burger', 'hamburger'], proteinPer100g: 17, kcalPer100g: 295 },
  { keywords: ['curry', 'stew', 'gravy'], proteinPer100g: 8, kcalPer100g: 120 },
  { keywords: ['cake', 'pastry', 'donut', 'cookie'], proteinPer100g: 5, kcalPer100g: 350 },
  { keywords: ['milk'], proteinPer100g: 3.4, kcalPer100g: 42 },
  { keywords: ['peanut butter', 'almond butter'], proteinPer100g: 25, kcalPer100g: 588 },
  { keywords: ['nuts', 'almond', 'almonds', 'walnut'], proteinPer100g: 15, kcalPer100g: 607 },
  { keywords: ['bacon', 'sausage'], proteinPer100g: 12, kcalPer100g: 541 },
  { keywords: ['turkey', 'turkey breast'], proteinPer100g: 29, kcalPer100g: 135 },
  { keywords: ['ham'], proteinPer100g: 18, kcalPer100g: 145 },
  { keywords: ['tuna salad', 'chicken salad'], proteinPer100g: 15, kcalPer100g: 180 },
  { keywords: ['avocado'], proteinPer100g: 2, kcalPer100g: 160 },
  { keywords: ['fries', 'french fries'], proteinPer100g: 3.4, kcalPer100g: 312 },
  { keywords: ['potato', 'mashed potato'], proteinPer100g: 2, kcalPer100g: 87 },
  { keywords: ['sweet potato'], proteinPer100g: 1.6, kcalPer100g: 90 },
  { keywords: ['oil', 'butter', 'ghee', 'dressing'], proteinPer100g: 0, kcalPer100g: 717 },
];

function lookupDensityField(foodName: string, field: 'proteinPer100g' | 'kcalPer100g'): number | null {
  const normalized = foodName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  let best: { score: number; value: number } | null = null;

  for (const entry of PROTEIN_DENSITY_TABLE) {
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword)) {
        const score = keyword.length;
        if (!best || score > best.score) {
          best = { score, value: entry[field] };
        }
      }
    }
  }

  return best?.value ?? null;
}

export function lookupProteinDensity(foodName: string): number | null {
  return lookupDensityField(foodName, 'proteinPer100g');
}

export function lookupCalorieDensity(foodName: string): number | null {
  return lookupDensityField(foodName, 'kcalPer100g');
}

export function proteinFromDensity(grams: number, densityPer100g: number): number {
  return Math.round((grams * densityPer100g) / 100 * 10) / 10;
}
