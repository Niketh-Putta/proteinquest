/** Cooked edible weight energy density (kcal per 100g). USDA-aligned anchors for calibration. */
export interface CalorieDensityEntry {
  keywords: string[];
  kcalPer100g: number;
}

export const CALORIE_DENSITY_TABLE: CalorieDensityEntry[] = [
  { keywords: ['chicken breast', 'grilled chicken', 'chicken strip', 'chicken slice'], kcalPer100g: 165 },
  { keywords: ['chicken thigh', 'dark meat chicken'], kcalPer100g: 209 },
  { keywords: ['chicken wing', 'chicken drumstick'], kcalPer100g: 203 },
  { keywords: ['ground beef', 'beef patty', 'steak', 'beef'], kcalPer100g: 250 },
  { keywords: ['pork chop', 'pork tenderloin', 'pork loin'], kcalPer100g: 242 },
  { keywords: ['salmon', 'tuna', 'cod', 'fish fillet', 'grilled fish'], kcalPer100g: 208 },
  { keywords: ['shrimp', 'prawn'], kcalPer100g: 99 },
  { keywords: ['egg white', 'egg whites'], kcalPer100g: 52 },
  { keywords: ['egg', 'fried egg', 'scrambled egg', 'boiled egg', 'poached egg'], kcalPer100g: 155 },
  { keywords: ['tofu', 'tempeh'], kcalPer100g: 76 },
  { keywords: ['greek yogurt', 'yogurt', 'skyr'], kcalPer100g: 97 },
  { keywords: ['cottage cheese', 'ricotta'], kcalPer100g: 98 },
  { keywords: ['cheddar', 'mozzarella', 'parmesan', 'cheese'], kcalPer100g: 350 },
  { keywords: ['protein shake', 'protein powder'], kcalPer100g: 400 },
  { keywords: ['protein bar', 'energy bar'], kcalPer100g: 400 },
  { keywords: ['lentil', 'lentils', 'dal', 'chickpea', 'chickpeas', 'bean', 'beans'], kcalPer100g: 116 },
  { keywords: ['kale', 'spinach', 'broccoli', 'greens', 'salad greens'], kcalPer100g: 35 },
  { keywords: ['rice', 'white rice', 'brown rice'], kcalPer100g: 130 },
  { keywords: ['pasta', 'noodle', 'noodles'], kcalPer100g: 131 },
  { keywords: ['bread', 'toast', 'bun', 'roll'], kcalPer100g: 265 },
  { keywords: ['pizza'], kcalPer100g: 266 },
  { keywords: ['burger', 'hamburger'], kcalPer100g: 250 },
  { keywords: ['curry', 'stew'], kcalPer100g: 120 },
  { keywords: ['cake', 'pastry', 'donut', 'cookie'], kcalPer100g: 350 },
  { keywords: ['milk'], kcalPer100g: 42 },
  { keywords: ['peanut butter', 'almond butter'], kcalPer100g: 588 },
  { keywords: ['nuts', 'almond', 'almonds', 'walnut'], kcalPer100g: 580 },
  { keywords: ['bacon', 'sausage'], kcalPer100g: 300 },
  { keywords: ['turkey', 'turkey breast'], kcalPer100g: 135 },
  { keywords: ['ham'], kcalPer100g: 145 },
  { keywords: ['tuna salad', 'chicken salad'], kcalPer100g: 180 },
  { keywords: ['fries', 'french fries', 'fried'], kcalPer100g: 312 },
  { keywords: ['avocado'], kcalPer100g: 160 },
  { keywords: ['potato', 'mashed potato'], kcalPer100g: 87 },
  { keywords: ['sweet potato'], kcalPer100g: 90 },
  { keywords: ['oil', 'butter', 'dressing'], kcalPer100g: 717 },
];

export function lookupCalorieDensity(foodName: string): number | null {
  const normalized = foodName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  let best: { score: number; density: number } | null = null;

  for (const entry of CALORIE_DENSITY_TABLE) {
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword)) {
        const score = keyword.length;
        if (!best || score > best.score) {
          best = { score, density: entry.kcalPer100g };
        }
      }
    }
  }

  return best?.density ?? null;
}

export function caloriesFromDensity(grams: number, kcalPer100g: number): number {
  return Math.round((grams * kcalPer100g) / 100);
}
