/** Cooked edible weight protein density (g per 100g). USDA-aligned anchors for calibration. */
export interface DensityEntry {
  keywords: string[];
  proteinPer100g: number;
}

export const PROTEIN_DENSITY_TABLE: DensityEntry[] = [
  { keywords: ['chicken breast', 'grilled chicken', 'chicken strip', 'chicken slice'], proteinPer100g: 31 },
  { keywords: ['chicken thigh', 'dark meat chicken'], proteinPer100g: 26 },
  { keywords: ['chicken wing', 'chicken drumstick'], proteinPer100g: 27 },
  { keywords: ['ground beef', 'beef patty', 'steak', 'beef'], proteinPer100g: 26 },
  { keywords: ['pork chop', 'pork tenderloin', 'pork loin'], proteinPer100g: 27 },
  { keywords: ['salmon', 'tuna', 'cod', 'fish fillet', 'grilled fish'], proteinPer100g: 25 },
  { keywords: ['shrimp', 'prawn'], proteinPer100g: 24 },
  { keywords: ['egg white', 'egg whites'], proteinPer100g: 11 },
  { keywords: ['egg', 'fried egg', 'scrambled egg', 'boiled egg', 'poached egg'], proteinPer100g: 13 },
  { keywords: ['tofu', 'tempeh'], proteinPer100g: 17 },
  { keywords: ['greek yogurt', 'yogurt', 'skyr'], proteinPer100g: 10 },
  { keywords: ['cottage cheese', 'ricotta'], proteinPer100g: 11 },
  { keywords: ['cheddar', 'mozzarella', 'parmesan', 'cheese'], proteinPer100g: 25 },
  { keywords: ['protein shake', 'protein powder'], proteinPer100g: 80 },
  { keywords: ['protein bar', 'energy bar'], proteinPer100g: 30 },
  { keywords: ['lentil', 'lentils', 'dal', 'chickpea', 'chickpeas', 'bean', 'beans'], proteinPer100g: 9 },
  { keywords: ['kale', 'spinach', 'broccoli', 'greens', 'salad greens'], proteinPer100g: 3 },
  { keywords: ['rice', 'white rice', 'brown rice'], proteinPer100g: 2.7 },
  { keywords: ['pasta', 'noodle', 'noodles'], proteinPer100g: 5 },
  { keywords: ['bread', 'toast', 'bun', 'roll'], proteinPer100g: 9 },
  { keywords: ['pizza'], proteinPer100g: 12 },
  { keywords: ['burger', 'hamburger'], proteinPer100g: 17 },
  { keywords: ['curry', 'stew'], proteinPer100g: 8 },
  { keywords: ['cake', 'pastry', 'donut', 'cookie'], proteinPer100g: 5 },
  { keywords: ['milk'], proteinPer100g: 3.4 },
  { keywords: ['peanut butter', 'almond butter'], proteinPer100g: 25 },
  { keywords: ['nuts', 'almond', 'almonds', 'walnut'], proteinPer100g: 15 },
  { keywords: ['bacon', 'sausage'], proteinPer100g: 12 },
  { keywords: ['turkey', 'turkey breast'], proteinPer100g: 29 },
  { keywords: ['ham'], proteinPer100g: 18 },
  { keywords: ['tuna salad', 'chicken salad'], proteinPer100g: 15 },
];

export function lookupProteinDensity(foodName: string): number | null {
  const normalized = foodName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  let best: { score: number; density: number } | null = null;

  for (const entry of PROTEIN_DENSITY_TABLE) {
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword)) {
        const score = keyword.length;
        if (!best || score > best.score) {
          best = { score, density: entry.proteinPer100g };
        }
      }
    }
  }

  return best?.density ?? null;
}

export function proteinFromDensity(grams: number, densityPer100g: number): number {
  return Math.round((grams * densityPer100g) / 100 * 10) / 10;
}
