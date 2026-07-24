import AsyncStorage from '@react-native-async-storage/async-storage';

/** Searchable food entries for Add Ingredient. Values are per default portion (qty 1). */
export type CatalogFood = {
  name: string;
  /** Default portion label at quantity 1. */
  portion: string;
  protein_g: number;
  calories_g: number;
  estimated_grams?: number;
  /** Optional aliases matched in search. */
  aliases?: string[];
};

const RECENT_KEY = 'pq_recent_ingredients_v1';
const MAX_RECENT = 12;

export const COMMON_FOODS: CatalogFood[] = [
  { name: 'Egg', portion: '1 egg', protein_g: 6.3, calories_g: 72, estimated_grams: 50 },
  { name: 'Chicken breast', portion: '1 serving', protein_g: 31, calories_g: 165, estimated_grams: 100 },
  { name: 'Rice', portion: '1 serving', protein_g: 2.7, calories_g: 130, estimated_grams: 100 },
  { name: 'Paneer', portion: '1 serving', protein_g: 18, calories_g: 265, estimated_grams: 100 },
  { name: 'Milk', portion: '1 cup', protein_g: 8, calories_g: 122, estimated_grams: 244 },
  { name: 'Banana', portion: '1 banana', protein_g: 1.3, calories_g: 105, estimated_grams: 118 },
  { name: 'Curd', portion: '1 serving', protein_g: 3.5, calories_g: 60, estimated_grams: 100 },
  { name: 'Oats', portion: '1 serving', protein_g: 5, calories_g: 150, estimated_grams: 40 },
  { name: 'Dal', portion: '1 bowl', protein_g: 9, calories_g: 120, estimated_grams: 150 },
];

/** Broad catalog — includes variants like pineapple / pineapple slices. */
export const FOOD_CATALOG: CatalogFood[] = [
  ...COMMON_FOODS,
  { name: 'Pineapple', portion: '1 serving', protein_g: 0.5, calories_g: 50, estimated_grams: 100, aliases: ['ananas'] },
  {
    name: 'Pineapple slices',
    portion: '1 slice',
    protein_g: 0.4,
    calories_g: 40,
    estimated_grams: 75,
    aliases: ['pineapple slice'],
  },
  { name: 'Pineapple chunks', portion: '1 cup', protein_g: 0.8, calories_g: 82, estimated_grams: 165 },
  { name: 'Apple', portion: '1 apple', protein_g: 0.5, calories_g: 95, estimated_grams: 182 },
  { name: 'Apple slices', portion: '1 serving', protein_g: 0.3, calories_g: 50, estimated_grams: 90 },
  { name: 'Orange', portion: '1 orange', protein_g: 1.2, calories_g: 62, estimated_grams: 131 },
  { name: 'Mango', portion: '1 mango', protein_g: 1.4, calories_g: 150, estimated_grams: 200 },
  { name: 'Grapes', portion: '1 serving', protein_g: 0.6, calories_g: 70, estimated_grams: 100 },
  { name: 'Strawberries', portion: '1 serving', protein_g: 0.7, calories_g: 32, estimated_grams: 100 },
  { name: 'Blueberries', portion: '1 serving', protein_g: 0.7, calories_g: 57, estimated_grams: 100 },
  { name: 'Watermelon', portion: '1 serving', protein_g: 0.6, calories_g: 30, estimated_grams: 100 },
  { name: 'Avocado', portion: '1 avocado', protein_g: 3, calories_g: 240, estimated_grams: 150 },
  { name: 'Tomato', portion: '1 tomato', protein_g: 1, calories_g: 22, estimated_grams: 120 },
  { name: 'Cucumber', portion: '1 cucumber', protein_g: 1, calories_g: 30, estimated_grams: 200 },
  { name: 'Carrot', portion: '1 carrot', protein_g: 0.6, calories_g: 25, estimated_grams: 60 },
  { name: 'Potato', portion: '1 potato', protein_g: 3, calories_g: 160, estimated_grams: 170 },
  { name: 'Sweet potato', portion: '1 serving', protein_g: 2, calories_g: 110, estimated_grams: 130 },
  { name: 'Broccoli', portion: '1 serving', protein_g: 2.8, calories_g: 35, estimated_grams: 100 },
  { name: 'Spinach', portion: '1 serving', protein_g: 2.9, calories_g: 23, estimated_grams: 100 },
  { name: 'Salad', portion: '1 bowl', protein_g: 2, calories_g: 40, estimated_grams: 120 },
  { name: 'Lettuce', portion: '1 serving', protein_g: 0.9, calories_g: 15, estimated_grams: 80 },
  { name: 'Onion', portion: '1 onion', protein_g: 1.1, calories_g: 44, estimated_grams: 110 },
  { name: 'Garlic', portion: '1 clove', protein_g: 0.2, calories_g: 4, estimated_grams: 3 },
  { name: 'Dosa', portion: '1 large', protein_g: 5.6, calories_g: 170, estimated_grams: 90 },
  { name: 'Idli', portion: '1 idli', protein_g: 2, calories_g: 40, estimated_grams: 35 },
  { name: 'Chapati', portion: '1 chapati', protein_g: 3, calories_g: 100, estimated_grams: 40 },
  { name: 'Roti', portion: '1 roti', protein_g: 3, calories_g: 100, estimated_grams: 40 },
  { name: 'Paratha', portion: '1 paratha', protein_g: 4, calories_g: 180, estimated_grams: 70 },
  { name: 'Naan', portion: '1 naan', protein_g: 9, calories_g: 260, estimated_grams: 90 },
  { name: 'Poha', portion: '1 serving', protein_g: 3, calories_g: 180, estimated_grams: 150 },
  { name: 'Upma', portion: '1 serving', protein_g: 4, calories_g: 200, estimated_grams: 150 },
  { name: 'Sambar', portion: '1 bowl', protein_g: 5, calories_g: 90, estimated_grams: 200 },
  { name: 'Chutney', portion: 'small serving', protein_g: 1, calories_g: 40, estimated_grams: 30 },
  { name: 'Coconut chutney', portion: 'small serving', protein_g: 1.2, calories_g: 55, estimated_grams: 35 },
  { name: 'Biryani', portion: '1 plate', protein_g: 18, calories_g: 450, estimated_grams: 300 },
  { name: 'Curry', portion: '1 bowl', protein_g: 10, calories_g: 200, estimated_grams: 200 },
  { name: 'Chicken curry', portion: '1 bowl', protein_g: 22, calories_g: 280, estimated_grams: 220 },
  { name: 'Egg curry', portion: '1 serving', protein_g: 14, calories_g: 220, estimated_grams: 200 },
  { name: 'Fish curry', portion: '1 serving', protein_g: 20, calories_g: 240, estimated_grams: 200 },
  { name: 'Prawns', portion: '1 serving', protein_g: 20, calories_g: 100, estimated_grams: 100 },
  { name: 'Salmon', portion: '1 fillet', protein_g: 22, calories_g: 200, estimated_grams: 100 },
  { name: 'Tuna', portion: '1 serving', protein_g: 25, calories_g: 130, estimated_grams: 100 },
  { name: 'Fish', portion: '1 fillet', protein_g: 20, calories_g: 150, estimated_grams: 100 },
  { name: 'Chicken thigh', portion: '1 thigh', protein_g: 20, calories_g: 180, estimated_grams: 100 },
  { name: 'Chicken wing', portion: '1 wing', protein_g: 5, calories_g: 70, estimated_grams: 30 },
  { name: 'Turkey', portion: '1 serving', protein_g: 29, calories_g: 150, estimated_grams: 100 },
  { name: 'Beef', portion: '1 serving', protein_g: 26, calories_g: 250, estimated_grams: 100 },
  { name: 'Lamb', portion: '1 serving', protein_g: 25, calories_g: 280, estimated_grams: 100 },
  { name: 'Mutton', portion: '1 serving', protein_g: 25, calories_g: 290, estimated_grams: 100 },
  { name: 'Pork', portion: '1 serving', protein_g: 27, calories_g: 242, estimated_grams: 100 },
  { name: 'Bacon', portion: '1 slice', protein_g: 3, calories_g: 40, estimated_grams: 10 },
  { name: 'Sausage', portion: '1 sausage', protein_g: 8, calories_g: 150, estimated_grams: 50 },
  { name: 'Ham', portion: '1 slice', protein_g: 5, calories_g: 35, estimated_grams: 25 },
  { name: 'Tofu', portion: '1 serving', protein_g: 8, calories_g: 80, estimated_grams: 100 },
  { name: 'Tempeh', portion: '1 serving', protein_g: 19, calories_g: 190, estimated_grams: 100 },
  { name: 'Chickpeas', portion: '1 serving', protein_g: 9, calories_g: 160, estimated_grams: 100 },
  { name: 'Lentils', portion: '1 serving', protein_g: 9, calories_g: 120, estimated_grams: 100 },
  { name: 'Rajma', portion: '1 bowl', protein_g: 9, calories_g: 150, estimated_grams: 150 },
  { name: 'Chole', portion: '1 bowl', protein_g: 9, calories_g: 180, estimated_grams: 160 },
  { name: 'Black beans', portion: '1 serving', protein_g: 8, calories_g: 130, estimated_grams: 100 },
  { name: 'Peanut butter', portion: '1 tbsp', protein_g: 4, calories_g: 94, estimated_grams: 16 },
  { name: 'Almonds', portion: '1 handful', protein_g: 6, calories_g: 160, estimated_grams: 28 },
  { name: 'Walnuts', portion: '1 handful', protein_g: 4, calories_g: 180, estimated_grams: 28 },
  { name: 'Cashews', portion: '1 handful', protein_g: 5, calories_g: 160, estimated_grams: 28 },
  { name: 'Peanuts', portion: '1 handful', protein_g: 7, calories_g: 160, estimated_grams: 28 },
  { name: 'Protein powder', portion: '1 scoop', protein_g: 24, calories_g: 120, estimated_grams: 30 },
  { name: 'Whey protein', portion: '1 scoop', protein_g: 24, calories_g: 120, estimated_grams: 30 },
  { name: 'Greek yogurt', portion: '1 serving', protein_g: 10, calories_g: 100, estimated_grams: 150 },
  { name: 'Yogurt', portion: '1 serving', protein_g: 5, calories_g: 90, estimated_grams: 150 },
  { name: 'Cheese', portion: '1 slice', protein_g: 7, calories_g: 110, estimated_grams: 28 },
  { name: 'Cheddar', portion: '1 slice', protein_g: 7, calories_g: 110, estimated_grams: 28 },
  { name: 'Mozzarella', portion: '1 serving', protein_g: 7, calories_g: 85, estimated_grams: 28 },
  { name: 'Cottage cheese', portion: '1 serving', protein_g: 12, calories_g: 100, estimated_grams: 100 },
  { name: 'Butter', portion: '1 tsp', protein_g: 0.1, calories_g: 34, estimated_grams: 5 },
  { name: 'Ghee', portion: '1 tsp', protein_g: 0, calories_g: 45, estimated_grams: 5 },
  { name: 'Olive oil', portion: '1 tbsp', protein_g: 0, calories_g: 119, estimated_grams: 14 },
  { name: 'Bread', portion: '1 slice', protein_g: 3, calories_g: 80, estimated_grams: 30 },
  { name: 'Toast', portion: '1 slice', protein_g: 3, calories_g: 80, estimated_grams: 30 },
  { name: 'Bread slices', portion: '1 slice', protein_g: 3, calories_g: 80, estimated_grams: 30 },
  { name: 'Bagel', portion: '1 bagel', protein_g: 10, calories_g: 250, estimated_grams: 95 },
  { name: 'Croissant', portion: '1 croissant', protein_g: 5, calories_g: 230, estimated_grams: 60 },
  { name: 'Pasta', portion: '1 serving', protein_g: 7, calories_g: 220, estimated_grams: 140 },
  { name: 'Noodles', portion: '1 serving', protein_g: 6, calories_g: 200, estimated_grams: 140 },
  { name: 'Spaghetti', portion: '1 serving', protein_g: 7, calories_g: 220, estimated_grams: 140 },
  { name: 'Pizza', portion: '1 slice', protein_g: 12, calories_g: 285, estimated_grams: 100 },
  { name: 'Burger', portion: '1 burger', protein_g: 25, calories_g: 500, estimated_grams: 220 },
  { name: 'Sandwich', portion: '1 sandwich', protein_g: 15, calories_g: 350, estimated_grams: 180 },
  { name: 'Wrap', portion: '1 wrap', protein_g: 18, calories_g: 350, estimated_grams: 200 },
  { name: 'Taco', portion: '1 taco', protein_g: 10, calories_g: 180, estimated_grams: 100 },
  { name: 'Samosa', portion: '1 samosa', protein_g: 4, calories_g: 250, estimated_grams: 80 },
  { name: 'Vada', portion: '1 vada', protein_g: 3, calories_g: 140, estimated_grams: 50 },
  { name: 'Pakora', portion: '1 serving', protein_g: 4, calories_g: 200, estimated_grams: 80 },
  { name: 'Fries', portion: '1 serving', protein_g: 3, calories_g: 320, estimated_grams: 100 },
  { name: 'French fries', portion: '1 serving', protein_g: 3, calories_g: 320, estimated_grams: 100 },
  { name: 'Hash browns', portion: '1 serving', protein_g: 2, calories_g: 140, estimated_grams: 70 },
  { name: 'Omelette', portion: '1 omelette', protein_g: 14, calories_g: 180, estimated_grams: 120 },
  { name: 'Scrambled eggs', portion: '1 egg', protein_g: 6.3, calories_g: 90, estimated_grams: 50 },
  { name: 'Boiled egg', portion: '1 egg', protein_g: 6.3, calories_g: 72, estimated_grams: 50 },
  { name: 'Egg white', portion: '1 white', protein_g: 3.6, calories_g: 17, estimated_grams: 33 },
  { name: 'Pancake', portion: '1 pancake', protein_g: 3, calories_g: 100, estimated_grams: 50 },
  { name: 'Waffle', portion: '1 waffle', protein_g: 5, calories_g: 200, estimated_grams: 75 },
  { name: 'Cereal', portion: '1 bowl', protein_g: 3, calories_g: 150, estimated_grams: 40 },
  { name: 'Granola', portion: '1 serving', protein_g: 4, calories_g: 180, estimated_grams: 45 },
  { name: 'Honey', portion: '1 tbsp', protein_g: 0, calories_g: 64, estimated_grams: 21 },
  { name: 'Sugar', portion: '1 tsp', protein_g: 0, calories_g: 16, estimated_grams: 4 },
  { name: 'Chocolate', portion: '1 bar', protein_g: 2, calories_g: 210, estimated_grams: 40 },
  { name: 'Ice cream', portion: '1 scoop', protein_g: 3, calories_g: 140, estimated_grams: 70 },
  { name: 'Cookie', portion: '1 cookie', protein_g: 1, calories_g: 70, estimated_grams: 15 },
  { name: 'Cake', portion: '1 slice', protein_g: 3, calories_g: 250, estimated_grams: 80 },
  { name: 'Coffee', portion: '1 cup', protein_g: 0.3, calories_g: 5, estimated_grams: 240 },
  { name: 'Tea', portion: '1 cup', protein_g: 0, calories_g: 2, estimated_grams: 240 },
  { name: 'Orange juice', portion: '1 cup', protein_g: 1.7, calories_g: 110, estimated_grams: 248 },
  { name: 'Smoothie', portion: '1 glass', protein_g: 5, calories_g: 180, estimated_grams: 300 },
  { name: 'Protein shake', portion: '1 shake', protein_g: 25, calories_g: 180, estimated_grams: 300 },
  { name: 'Soda', portion: '1 can', protein_g: 0, calories_g: 140, estimated_grams: 355 },
  { name: 'Water', portion: '1 glass', protein_g: 0, calories_g: 0, estimated_grams: 250 },
  { name: 'Quinoa', portion: '1 serving', protein_g: 4, calories_g: 120, estimated_grams: 100 },
  { name: 'Brown rice', portion: '1 serving', protein_g: 2.6, calories_g: 110, estimated_grams: 100 },
  { name: 'White rice', portion: '1 serving', protein_g: 2.7, calories_g: 130, estimated_grams: 100 },
  { name: 'Jeera rice', portion: '1 serving', protein_g: 3, calories_g: 180, estimated_grams: 150 },
  { name: 'Fried rice', portion: '1 plate', protein_g: 8, calories_g: 350, estimated_grams: 250 },
  { name: 'Mushroom', portion: '1 serving', protein_g: 3, calories_g: 22, estimated_grams: 100 },
  { name: 'Corn', portion: '1 serving', protein_g: 3, calories_g: 90, estimated_grams: 100 },
  { name: 'Peas', portion: '1 serving', protein_g: 5, calories_g: 80, estimated_grams: 100 },
  { name: 'Beans', portion: '1 serving', protein_g: 8, calories_g: 130, estimated_grams: 100 },
  { name: 'Hummus', portion: '2 tbsp', protein_g: 2, calories_g: 50, estimated_grams: 30 },
  { name: 'Guacamole', portion: '2 tbsp', protein_g: 1, calories_g: 50, estimated_grams: 30 },
  { name: 'Salsa', portion: '2 tbsp', protein_g: 0.5, calories_g: 10, estimated_grams: 30 },
  { name: 'Ketchup', portion: '1 tbsp', protein_g: 0.2, calories_g: 20, estimated_grams: 17 },
  { name: 'Mayonnaise', portion: '1 tbsp', protein_g: 0.1, calories_g: 94, estimated_grams: 14 },
  { name: 'Soy sauce', portion: '1 tbsp', protein_g: 1, calories_g: 10, estimated_grams: 16 },
  { name: 'Soup', portion: '1 bowl', protein_g: 5, calories_g: 100, estimated_grams: 250 },
  { name: 'Ramen', portion: '1 bowl', protein_g: 12, calories_g: 450, estimated_grams: 400 },
  { name: 'Sushi', portion: '1 piece', protein_g: 1.7, calories_g: 33, estimated_grams: 25 },
  { name: 'Dumpling', portion: '1 dumpling', protein_g: 2, calories_g: 50, estimated_grams: 25 },
  { name: 'Momo', portion: '1 momo', protein_g: 1.6, calories_g: 44, estimated_grams: 24 },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesQuery(food: CatalogFood, q: string): boolean {
  if (!q) return true;
  const n = normalize(food.name);
  if (n.includes(q)) return true;
  return (food.aliases ?? []).some((a) => normalize(a).includes(q));
}

/** Deduped catalog (COMMON entries appear once). */
export function allCatalogFoods(): CatalogFood[] {
  const seen = new Set<string>();
  const out: CatalogFood[] = [];
  for (const food of FOOD_CATALOG) {
    const key = normalize(food.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(food);
  }
  return out;
}

export function searchCatalog(query: string): CatalogFood[] {
  const q = normalize(query);
  const all = allCatalogFoods();
  if (!q) return all;
  const starts: CatalogFood[] = [];
  const contains: CatalogFood[] = [];
  for (const food of all) {
    if (!matchesQuery(food, q)) continue;
    if (normalize(food.name).startsWith(q)) starts.push(food);
    else contains.push(food);
  }
  return [...starts, ...contains].slice(0, 60);
}

export async function loadRecentFoods(): Promise<CatalogFood[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CatalogFood[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && typeof f.name === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export async function pushRecentFood(food: CatalogFood): Promise<void> {
  try {
    const prev = await loadRecentFoods();
    const next = [food, ...prev.filter((f) => normalize(f.name) !== normalize(food.name))].slice(
      0,
      MAX_RECENT,
    );
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
