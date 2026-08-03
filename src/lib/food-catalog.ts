import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Heavy catalog chunks (~700KB) are loaded lazily via `loadHeavyFoodCatalog` /
 * `warmFoodCatalog` so Add Ingredient can paint COMMON + search shell first.
 * Do not statically import those modules here — that blocks native navigation.
 */

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
  /** From remote catalogue: pin into COMMON list. */
  is_common?: boolean;
};

const RECENT_KEY = 'pq_recent_ingredients_v1';
const REMOTE_CACHE_KEY = 'pq_remote_food_catalog_v1';
const MAX_RECENT = 12;

type RemoteFoodRow = {
  name: string;
  portion: string;
  protein_g: number | string;
  calories_g: number | string;
  estimated_grams: number | string | null;
  aliases: string[] | null;
  is_common: boolean | null;
};

/** Live remote rows (Supabase). Merged over bundled catalog by name. */
let remoteFoods: CatalogFood[] = [];
let remoteLoadedAt = 0;
let remoteFetchInFlight: Promise<CatalogFood[]> | null = null;

/** Everyday staples shown under COMMON (scrollable browse list). */
export const COMMON_FOODS: CatalogFood[] = [
  { name: 'Egg', portion: '1 egg', protein_g: 6.3, calories_g: 72, estimated_grams: 50 },
  {
    name: 'Chicken breast',
    portion: '1 serving',
    protein_g: 31,
    calories_g: 165,
    estimated_grams: 100,
    aliases: ['chick breast', 'chickenbreast', 'chicken breast fillet'],
  },
  { name: 'Rice', portion: '1 bowl', protein_g: 4, calories_g: 200, estimated_grams: 150 },
  {
    name: 'Paneer',
    portion: '1 serving',
    protein_g: 18,
    calories_g: 265,
    estimated_grams: 100,
    aliases: ['indian cottage cheese', 'panir', 'panner'],
  },
  {
    name: 'Milk',
    portion: '1 cup',
    protein_g: 8,
    calories_g: 122,
    estimated_grams: 244,
    aliases: ['cows milk', 'dairy milk drink'],
  },
  { name: 'Banana', portion: '1 banana', protein_g: 1.3, calories_g: 105, estimated_grams: 118 },
  { name: 'Curd', portion: '1 bowl', protein_g: 6, calories_g: 90, estimated_grams: 150 },
  {
    name: 'Oats',
    portion: '1 bowl',
    protein_g: 8,
    calories_g: 220,
    estimated_grams: 60,
    aliases: ['oatmeal', 'porridge oats', 'oat'],
  },
  { name: 'Dal', portion: '1 bowl', protein_g: 9, calories_g: 120, estimated_grams: 150 },
  { name: 'Greek yogurt', portion: '1 pot', protein_g: 15, calories_g: 120, estimated_grams: 150 },
  { name: 'Whey protein', portion: '1 scoop', protein_g: 24, calories_g: 120, estimated_grams: 30 },
  { name: 'Salmon', portion: '1 fillet', protein_g: 35, calories_g: 280, estimated_grams: 150 },
  { name: 'Tuna', portion: '1 can', protein_g: 25, calories_g: 100, estimated_grams: 110 },
  { name: 'Turkey breast', portion: '1 serving', protein_g: 29, calories_g: 135, estimated_grams: 100 },
  { name: 'Lean beef', portion: '1 serving', protein_g: 26, calories_g: 200, estimated_grams: 100 },
  { name: 'Steak', portion: '1 serving', protein_g: 30, calories_g: 250, estimated_grams: 120 },
  { name: 'Prawns', portion: '1 serving', protein_g: 20, calories_g: 100, estimated_grams: 100 },
  { name: 'Tofu', portion: '1 serving', protein_g: 12, calories_g: 110, estimated_grams: 120 },
  { name: 'Cottage cheese', portion: '1 tub', protein_g: 25, calories_g: 180, estimated_grams: 200 },
  { name: 'Skyr', portion: '1 pot', protein_g: 19, calories_g: 100, estimated_grams: 150 },
  { name: 'Protein bar', portion: '1 bar', protein_g: 20, calories_g: 200, estimated_grams: 60 },
  { name: 'Protein shake', portion: '1 bottle', protein_g: 25, calories_g: 160, estimated_grams: 330 },
  { name: 'Peanut butter', portion: '1 tablespoon', protein_g: 4, calories_g: 95, estimated_grams: 16 },
  { name: 'Almonds', portion: '1 handful', protein_g: 6, calories_g: 160, estimated_grams: 28 },
  { name: 'Bread', portion: '1 slice', protein_g: 3.5, calories_g: 80, estimated_grams: 30 },
  { name: 'Whole wheat roti', portion: '1 piece', protein_g: 3, calories_g: 100, estimated_grams: 40 },
  { name: 'Naan', portion: '1 piece', protein_g: 5, calories_g: 260, estimated_grams: 85 },
  { name: 'Pasta', portion: '1 bowl', protein_g: 8, calories_g: 280, estimated_grams: 180 },
  { name: 'Potato', portion: '1 potato', protein_g: 3, calories_g: 160, estimated_grams: 150 },
  { name: 'Sweet potato', portion: '1 serving', protein_g: 2, calories_g: 110, estimated_grams: 120 },
  { name: 'Broccoli', portion: '1 serving', protein_g: 3, calories_g: 40, estimated_grams: 100 },
  { name: 'Spinach', portion: '1 serving', protein_g: 3, calories_g: 25, estimated_grams: 100 },
  { name: 'Apple', portion: '1 apple', protein_g: 0.5, calories_g: 95, estimated_grams: 182 },
  { name: 'Orange', portion: '1 orange', protein_g: 1.2, calories_g: 62, estimated_grams: 131 },
  { name: 'Blueberries', portion: '1 handful', protein_g: 1, calories_g: 40, estimated_grams: 50 },
  { name: 'Avocado', portion: '1 avocado', protein_g: 3, calories_g: 240, estimated_grams: 150 },
  { name: 'Cheddar cheese', portion: '1 slice', protein_g: 6, calories_g: 110, estimated_grams: 28 },
  { name: 'Butter', portion: '1 tablespoon', protein_g: 0.1, calories_g: 100, estimated_grams: 14 },
  { name: 'Olive oil', portion: '1 tablespoon', protein_g: 0, calories_g: 120, estimated_grams: 14 },
  { name: 'Chickpeas', portion: '1 bowl', protein_g: 12, calories_g: 200, estimated_grams: 160 },
  { name: 'Black beans', portion: '1 bowl', protein_g: 14, calories_g: 200, estimated_grams: 160 },
  { name: 'Lentils', portion: '1 bowl', protein_g: 12, calories_g: 180, estimated_grams: 160 },
  { name: 'Quinoa', portion: '1 bowl', protein_g: 8, calories_g: 220, estimated_grams: 150 },
  { name: 'Couscous', portion: '1 bowl', protein_g: 6, calories_g: 200, estimated_grams: 150 },
  { name: 'Idli', portion: '2 pieces', protein_g: 4, calories_g: 120, estimated_grams: 80 },
  { name: 'Dosa', portion: '1 piece', protein_g: 4, calories_g: 120, estimated_grams: 80 },
  { name: 'Samosa', portion: '1 piece', protein_g: 4, calories_g: 150, estimated_grams: 60 },
  { name: 'Biryani', portion: '1 plate', protein_g: 28, calories_g: 550, estimated_grams: 400 },
  { name: 'Chicken curry', portion: '1 bowl', protein_g: 30, calories_g: 350, estimated_grams: 300 },
  { name: 'Egg fried rice', portion: '1 plate', protein_g: 15, calories_g: 450, estimated_grams: 320 },
  { name: 'Chicken wrap', portion: '1 wrap', protein_g: 30, calories_g: 450, estimated_grams: 250 },
  { name: 'Tuna sandwich', portion: '1 sandwich', protein_g: 25, calories_g: 400, estimated_grams: 200 },
  { name: 'Salad', portion: '1 bowl', protein_g: 5, calories_g: 120, estimated_grams: 200 },
  { name: 'Soup', portion: '1 bowl', protein_g: 5, calories_g: 100, estimated_grams: 250 },
  { name: 'Pizza slice', portion: '1 slice', protein_g: 12, calories_g: 300, estimated_grams: 120 },
  { name: 'Burger', portion: '1 sandwich', protein_g: 25, calories_g: 500, estimated_grams: 220 },
  { name: 'Sausage', portion: '1 piece', protein_g: 6, calories_g: 120, estimated_grams: 40 },
  { name: 'Bacon', portion: '2 pieces', protein_g: 6, calories_g: 80, estimated_grams: 30 },
  { name: 'Ham', portion: '2 slices', protein_g: 10, calories_g: 70, estimated_grams: 50 },
  { name: 'Hummus', portion: '2 tbsp', protein_g: 2.5, calories_g: 70, estimated_grams: 30 },
  { name: 'Dark chocolate', portion: '2 squares', protein_g: 2, calories_g: 110, estimated_grams: 20 },
  { name: 'Honey', portion: '1 tablespoon', protein_g: 0, calories_g: 64, estimated_grams: 21 },
  { name: 'Coffee with milk', portion: '1 cup', protein_g: 4, calories_g: 50, estimated_grams: 200 },
  { name: 'Orange juice', portion: '1 glass', protein_g: 1, calories_g: 110, estimated_grams: 250 },
  { name: 'Creatine', portion: '1 scoop', protein_g: 0, calories_g: 0, estimated_grams: 5 },
  { name: 'Casein protein', portion: '1 scoop', protein_g: 24, calories_g: 120, estimated_grams: 30 },
  { name: 'Egg whites', portion: '3 whites', protein_g: 11, calories_g: 50, estimated_grams: 100 },
  { name: 'Minced chicken', portion: '1 serving', protein_g: 27, calories_g: 150, estimated_grams: 100 },
  { name: 'Minced turkey', portion: '1 serving', protein_g: 27, calories_g: 150, estimated_grams: 100 },
  { name: 'Lamb', portion: '1 serving', protein_g: 25, calories_g: 250, estimated_grams: 100 },
  { name: 'Cod', portion: '1 fillet', protein_g: 20, calories_g: 90, estimated_grams: 100 },
  { name: 'Mackerel', portion: '1 fillet', protein_g: 20, calories_g: 200, estimated_grams: 100 },
  { name: 'Edamame', portion: '1 handful', protein_g: 8, calories_g: 90, estimated_grams: 60 },
  { name: 'Halloumi', portion: '1 serving', protein_g: 20, calories_g: 280, estimated_grams: 80 },
  { name: 'Feta', portion: '1 serving', protein_g: 8, calories_g: 120, estimated_grams: 50 },
  { name: 'Mozzarella', portion: '1 serving', protein_g: 12, calories_g: 150, estimated_grams: 60 },
  { name: 'Baked beans', portion: '1 can', protein_g: 10, calories_g: 180, estimated_grams: 200 },
  { name: 'Cornflakes', portion: '1 bowl', protein_g: 3, calories_g: 150, estimated_grams: 40 },
  { name: 'Granola', portion: '1 bowl', protein_g: 6, calories_g: 250, estimated_grams: 60 },
  { name: 'Porridge', portion: '1 bowl', protein_g: 8, calories_g: 220, estimated_grams: 200 },
  { name: 'Smoothie', portion: '1 glass', protein_g: 8, calories_g: 200, estimated_grams: 300 },
  { name: 'Ice cream', portion: '1 scoop', protein_g: 3, calories_g: 140, estimated_grams: 70 },
  { name: 'Croissant', portion: '1 piece', protein_g: 5, calories_g: 280, estimated_grams: 60 },
  { name: 'Bagel', portion: '1 piece', protein_g: 10, calories_g: 260, estimated_grams: 100 },
  { name: 'Pancakes', portion: '2 pieces', protein_g: 8, calories_g: 200, estimated_grams: 100 },
  { name: 'Waffle', portion: '1 piece', protein_g: 5, calories_g: 150, estimated_grams: 70 },
  { name: 'Fries', portion: '1 serving', protein_g: 4, calories_g: 350, estimated_grams: 120 },
  { name: 'Sushi', portion: '6 pieces', protein_g: 12, calories_g: 200, estimated_grams: 150 },
  { name: 'Ramen', portion: '1 bowl', protein_g: 18, calories_g: 500, estimated_grams: 450 },
  { name: 'Pho', portion: '1 bowl', protein_g: 25, calories_g: 400, estimated_grams: 450 },
  { name: 'Falafel', portion: '4 pieces', protein_g: 10, calories_g: 280, estimated_grams: 120 },
  { name: 'Hummus wrap', portion: '1 wrap', protein_g: 12, calories_g: 400, estimated_grams: 250 },
  { name: 'Chicken tikka', portion: '1 plate', protein_g: 35, calories_g: 350, estimated_grams: 220 },
  { name: 'Paneer tikka', portion: '1 plate', protein_g: 28, calories_g: 400, estimated_grams: 250 },
  { name: 'Chole', portion: '1 bowl', protein_g: 12, calories_g: 280, estimated_grams: 250 },
  { name: 'Rajma', portion: '1 bowl', protein_g: 12, calories_g: 260, estimated_grams: 250 },
  { name: 'Khichdi', portion: '1 bowl', protein_g: 8, calories_g: 250, estimated_grams: 250 },
  { name: 'Paratha', portion: '1 piece', protein_g: 5, calories_g: 180, estimated_grams: 60 },
  { name: 'Upma', portion: '1 bowl', protein_g: 6, calories_g: 220, estimated_grams: 200 },
  { name: 'Poha', portion: '1 bowl', protein_g: 6, calories_g: 250, estimated_grams: 200 },
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

/** Extended bundled rows (MORE_*, MEGA, brands, …). Null until lazy load finishes. */
let heavyFoods: CatalogFood[] | null = null;
let heavyLoadPromise: Promise<CatalogFood[]> | null = null;

let mergedAllCache: CatalogFood[] | null = null;
let mergedAllRemoteRef: CatalogFood[] | null = null;
let mergedAllHeavyRef: CatalogFood[] | null = null;

let mergedCommonCache: CatalogFood[] | null = null;
let mergedCommonRemoteRef: CatalogFood[] | null = null;

let sortedBrowseCache: CatalogFood[] | null = null;
let sortedBrowseRemoteRef: CatalogFood[] | null = null;
let sortedBrowseHeavyRef: CatalogFood[] | null = null;

function invalidateCatalogCaches() {
  mergedAllCache = null;
  mergedAllRemoteRef = null;
  mergedAllHeavyRef = null;
  mergedCommonCache = null;
  mergedCommonRemoteRef = null;
  sortedBrowseCache = null;
  sortedBrowseRemoteRef = null;
  sortedBrowseHeavyRef = null;
  indexedList = null;
  namePrefix2 = null;
  indexedRemoteRef = null;
  indexedHeavyRef = null;
}

export function isHeavyFoodCatalogLoaded(): boolean {
  return heavyFoods != null;
}

/** Dynamically import large catalog chunks one-by-one (safe to call often). */
export function loadHeavyFoodCatalog(): Promise<CatalogFood[]> {
  if (heavyFoods) return Promise.resolve(heavyFoods);
  if (heavyLoadPromise) return heavyLoadPromise;

  heavyLoadPromise = (async () => {
    // Sequential imports — Promise.all of 13 megachunks freezes Android Hermes for seconds.
    const loaders: Array<() => Promise<{ foods: CatalogFood[] }>> = [
      async () => ({ foods: (await import('./food-catalog-extra')).EXTRA_FOODS }),
      async () => ({ foods: (await import('./food-catalog-more')).MORE_FOODS }),
      async () => ({ foods: (await import('./food-catalog-more-2')).MORE_FOODS_2 }),
      async () => ({ foods: (await import('./food-catalog-more-3')).MORE_FOODS_3 }),
      async () => ({ foods: (await import('./food-catalog-more-4')).MORE_FOODS_4 }),
      async () => ({ foods: (await import('./food-catalog-more-5')).MORE_FOODS_5 }),
      async () => ({ foods: (await import('./food-catalog-more-6')).MORE_FOODS_6 }),
      async () => ({ foods: (await import('./food-catalog-unique')).UNIQUE_FOODS }),
      async () => ({ foods: (await import('./food-catalog-world')).WORLD_FOODS }),
      async () => ({ foods: (await import('./food-catalog-brands')).BRAND_FOODS }),
      async () => ({ foods: (await import('./food-catalog-meals')).MEAL_FOODS }),
      async () => ({ foods: (await import('./food-catalog-meals-2')).MEAL_FOODS_2 }),
      async () => ({ foods: (await import('./food-catalog-mega')).MEGA_FOODS }),
    ];

    const merged: CatalogFood[] = [];
    for (const load of loaders) {
      try {
        const { foods } = await load();
        // Avoid push(...huge) — large spreads can crash Hermes on Android.
        for (let i = 0; i < foods.length; i++) merged.push(foods[i]!);
      } catch (e) {
        console.warn('Food catalog chunk failed to load:', e);
      }
      await yieldToUi();
    }
    heavyFoods = merged;
    invalidateCatalogCaches();
    return heavyFoods;
  })().finally(() => {
    heavyLoadPromise = null;
  });

  return heavyLoadPromise;
}

/** Yield so Android can flush taps / frames between heavy catalog steps. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Platform.OS === 'android' ? 48 : 0);
  });
}

/**
 * Prefetch heavy chunks, then build caches in UI-yielding steps.
 * Never call from onPressIn — that freezes Android taps.
 */
export async function warmFoodCatalog(): Promise<void> {
  await loadHeavyFoodCatalog();
  await yieldToUi();
  // Remote refresh is nicety; do not block index build on network.
  void refreshRemoteFoodCatalog().catch(() => {});
  await yieldToUi();
  allCatalogFoods();
  await yieldToUi();
  getSortedBrowseCatalog();
  await yieldToUi();
  getIndexedFoods();
}

/** Cheap idle warm: import chunks only, no sync merge/sort/index. */
export async function prefetchHeavyFoodCatalogChunks(): Promise<void> {
  await loadHeavyFoodCatalog();
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[&']/g, '')
    .replace(/[-_/.,+()]/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Brand / food synonyms so "optimum nutrition" hits ON, "chick" hits chicken, etc. */
const SEARCH_SYNONYMS: Record<string, string[]> = {
  on: ['optimum nutrition', 'optimum', 'gold standard'],
  optimum: ['on', 'optimum nutrition', 'gold standard'],
  'optimum nutrition': ['on', 'gold standard'],
  gold: ['gold standard', 'on'],
  'gold standard': ['on', 'optimum nutrition', 'optimum'],
  mp: ['myprotein', 'my protein'],
  myprotein: ['mp', 'my protein'],
  'my protein': ['myprotein', 'mp'],
  quest: ['quest nutrition', 'quest bar'],
  grenade: ['carb killa', 'grenade bar'],
  barebells: ['barebell'],
  fairlife: ['fair life', 'core power'],
  'core power': ['fairlife'],
  whey: ['protein powder', 'whey protein', 'isolate', 'protein scoop'],
  'protein powder': ['whey', 'isolate', 'casein'],
  isolate: ['whey', 'protein powder'],
  casein: ['protein powder', 'night protein'],
  shake: ['protein shake', 'rtd', 'protein drink'],
  rtd: ['protein shake', 'ready to drink', 'protein drink'],
  'protein shake': ['rtd', 'shake', 'protein drink'],
  yogurt: ['yoghurt', 'skyr', 'greek yogurt'],
  yoghurt: ['yogurt', 'skyr'],
  skyr: ['yogurt', 'yoghurt'],
  chicken: ['chick', 'poultry', 'chicken breast', 'chiken'],
  chick: ['chicken'],
  chiken: ['chicken'],
  'chicken breast': ['chicken', 'breast'],
  paneer: ['indian cottage cheese', 'panir', 'panner'],
  panir: ['paneer', 'panner'],
  panner: ['paneer', 'panir'],
  biryani: ['biriyani', 'briyani', 'biriani'],
  biriyani: ['biryani', 'briyani'],
  briyani: ['biryani', 'biriyani'],
  gongura: ['gonogra', 'gonogrra', 'gongoura'],
  gonogra: ['gongura', 'gonogrra'],
  gonogrra: ['gongura', 'gonogra'],
  prawns: ['prawn', 'shrimp', 'shrimps'],
  prawn: ['prawns', 'shrimp'],
  shrimp: ['prawn', 'prawns', 'shrimps'],
  curd: ['yogurt', 'dahi'],
  dahi: ['curd', 'yogurt'],
  dal: ['daal', 'lentil', 'dahl'],
  daal: ['dal', 'lentil'],
  rice: ['chawal', 'biryani rice'],
  egg: ['eggs'],
  eggs: ['egg'],
  tuna: ['tinned tuna', 'canned tuna'],
  salmon: ['fish'],
  beef: ['steak'],
  steak: ['beef'],
  pb: ['peanut butter'],
  'peanut butter': ['pb'],
  oats: ['oatmeal', 'porridge'],
  oatmeal: ['oats', 'porridge'],
  porridge: ['oats', 'oatmeal'],
  wrap: ['tortilla', 'burrito'],
  sandwich: ['sarnie', 'butty'],
  coke: ['coca cola', 'cola'],
  'coca cola': ['coke', 'cola'],
  nandos: ['nando'],
  mcdonalds: ['mcd', 'macdonalds', 'mc donalds'],
  mcd: ['mcdonalds'],
  chipotle: ['chipotl'],
  subway: ['sub'],
  huel: ['meal replacement'],
  creatine: ['creatine monohydrate'],
  collagen: ['collagen peptides'],
};

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Early exit when length gap already exceeds a typical typo budget.
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j]! < rowMin) rowMin = cur[j]!;
    }
    if (rowMin > 2) return 3;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** Cheap phonetic-ish fold (ph/f, ck/k, iy→y). */
function foldPhonetic(s: string): string {
  return s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/iy/g, 'y').replace(/ey/g, 'y');
}

function typoBudget(len: number): number {
  if (len < 4) return 0;
  return len >= 7 ? 2 : 1;
}

const SYNONYM_KEYS = Object.keys(SEARCH_SYNONYMS);
const SYNONYM_KEYS_SORTED = [...SYNONYM_KEYS].sort((a, b) => b.length - a.length);
/** Single-word synonym keys for cheap typo expansion (no spaces). */
const SYNONYM_WORD_KEYS = SYNONYM_KEYS.filter((k) => !k.includes(' '));

const RESULT_CAP = 72;
const EXACT_CAP = 56;
const SIMILAR_CAP = 24;
const FUZZY_MIN_QUERY_LEN = 3;
const FUZZY_CANDIDATE_CAP = 700;

export type CatalogSearchBuckets = {
  exact: CatalogFood[];
  similar: CatalogFood[];
};

type IndexedFood = {
  food: CatalogFood;
  name: string;
  hay: string;
  words: string[];
  wordSet: Set<string>;
  /** First letter of each word; used to skip fuzzy work. */
  prefixChars: string;
};

let indexedList: IndexedFood[] | null = null;
let indexedRemoteRef: CatalogFood[] | null = null;
let indexedHeavyRef: CatalogFood[] | null = null;
/** First 2 chars of food name → entries (speeds prefix search). */
let namePrefix2: Map<string, IndexedFood[]> | null = null;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word / whole-phrase match (avoids "on isolate" hitting "protein isolate"). */
function hasWord(hay: string, needle: string): boolean {
  if (!needle) return true;
  const parts = needle.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;
  if (parts.length === 1) {
    // Fast path used only when wordSet is unavailable.
    const pattern = `(?:^|[^a-z0-9])${escapeRegExp(parts[0]!)}(?:[^a-z0-9]|$)`;
    return new RegExp(pattern).test(hay);
  }
  const pattern = parts.map(escapeRegExp).join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`).test(hay);
}

function hasWordInSet(wordSet: Set<string>, needle: string): boolean {
  if (!needle) return true;
  if (!needle.includes(' ')) return wordSet.has(needle);
  return false;
}

function buildIndexedFood(food: CatalogFood): IndexedFood {
  const name = normalize(food.name);
  const parts = [food.name, ...(food.aliases ?? [])];
  const auto: string[] = [];
  const nameWords = new Set(name.split(' ').filter(Boolean));
  for (const [key, syns] of Object.entries(SEARCH_SYNONYMS)) {
    const keyParts = key.split(' ');
    // Tiny keys (on/mp/pb) must not expand every "beans on toast" into Optimum Nutrition.
    if (key.length <= 2 && keyParts.length === 1) {
      if (name !== key && !name.startsWith(`${key} `)) continue;
    }
    const keyHit = keyParts.length === 1 ? nameWords.has(key) : hasWord(name, key);
    const synHit = syns.some((s) => {
      if (s.length <= 2) return name === s || name.startsWith(`${s} `);
      const sp = s.split(' ');
      return sp.length === 1 ? nameWords.has(s) : hasWord(name, s);
    });
    if (keyHit || synHit) auto.push(key, ...syns);
  }
  const hay = [...parts, ...auto].map(normalize).join(' · ');
  const words = hay.split(/[^a-z0-9]+/).filter(Boolean);
  const wordSet = new Set(words);
  const prefixChars = [...new Set(words.map((w) => w[0]!).filter(Boolean))].join('');
  return { food, name, hay, words, wordSet, prefixChars };
}

function getIndexedFoods(): IndexedFood[] {
  if (
    indexedList &&
    indexedRemoteRef === remoteFoods &&
    indexedHeavyRef === heavyFoods
  ) {
    return indexedList;
  }
  const foods = allCatalogFoods();
  const next = foods.map(buildIndexedFood);
  const prefix2 = new Map<string, IndexedFood[]>();
  for (const entry of next) {
    const key = entry.name.slice(0, 2);
    if (!key) continue;
    const bucket = prefix2.get(key);
    if (bucket) bucket.push(entry);
    else prefix2.set(key, [entry]);
  }
  indexedList = next;
  namePrefix2 = prefix2;
  indexedRemoteRef = remoteFoods;
  indexedHeavyRef = heavyFoods;
  return indexedList;
}

/** Cheap gate before scoreExact — skips edit-distance-free scoring work. */
function mightMatchExact(entry: IndexedFood, q: string, tokens: string[]): boolean {
  if (!q) return true;
  if (entry.name.startsWith(q)) return true;
  if (q.length >= 3 && entry.hay.includes(q)) return true;
  for (const t of tokens) {
    if (!t) continue;
    if (t.length >= 2) {
      if (!entry.prefixChars.includes(t[0]!)) continue;
      for (const w of entry.words) {
        if (w.startsWith(t) || (t.length >= 3 && w.includes(t))) return true;
      }
    }
    if (t.length >= 3 && entry.hay.includes(t)) return true;
  }
  return false;
}

/** Single-token prefix bucket union (falls back to full index). */
function exactSearchCandidates(q: string, tokens: string[], index: IndexedFood[]): IndexedFood[] {
  if (tokens.length !== 1) return index;
  const t = tokens[0]!;
  if (t.length < 2) return index;
  const prefix2 = namePrefix2;
  if (!prefix2) return index;
  const key = t.slice(0, 2);
  const bucket = prefix2.get(key);
  if (!bucket?.length) return index;
  // Prefix bucket can miss mid-name word matches — widen when bucket is small.
  if (bucket.length >= 80) return bucket;
  const seen = new Set<string>();
  const out: IndexedFood[] = [];
  const add = (entry: IndexedFood) => {
    if (seen.has(entry.name)) return;
    seen.add(entry.name);
    out.push(entry);
  };
  for (const entry of bucket) add(entry);
  if (out.length < EXACT_CAP) {
    for (const entry of index) {
      if (mightMatchExact(entry, q, tokens)) add(entry);
      if (out.length >= EXACT_CAP * 3) break;
    }
  }
  return out.length ? out : index;
}

/** Synonyms + light stemming only (no edit-distance). */
function expandTokenExact(token: string): string[] {
  const t = token.trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  const folded = foldPhonetic(t);
  if (folded !== t) out.add(folded);
  const syns = SEARCH_SYNONYMS[t];
  if (syns) for (const s of syns) out.add(s);
  if (t.length > 3 && t.endsWith('ies')) out.add(`${t.slice(0, -3)}y`);
  if (t.length > 3 && t.endsWith('es')) out.add(t.slice(0, -2));
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) out.add(t.slice(0, -1));
  return [...out];
}

/** Typo tolerance against known synonym keys (optium → optimum). */
function expandTokenFuzzyKeys(token: string): string[] {
  const t = token.trim();
  if (t.length < 4) return [];
  const out = new Set<string>();
  const folded = foldPhonetic(t);
  const maxDist = typoBudget(t.length);
  for (const key of SYNONYM_WORD_KEYS) {
    if (Math.abs(key.length - t.length) > maxDist) continue;
    if (editDistance(t, key) <= maxDist || editDistance(folded, foldPhonetic(key)) <= maxDist) {
      out.add(key);
      for (const s of SEARCH_SYNONYMS[key] ?? []) {
        if (s.length > 2) out.add(s);
      }
    }
  }
  return [...out];
}

function expandQuery(q: string): { phrases: string[]; tokens: string[]; tokenAlts: string[][] } {
  const phrases = new Set<string>([q]);
  for (const key of SYNONYM_KEYS_SORTED) {
    if (!q.includes(key)) continue;
    for (const alt of SEARCH_SYNONYMS[key] ?? []) {
      phrases.add(normalize(q.split(key).join(alt)));
    }
  }
  const tokens = q.split(' ').filter(Boolean);
  const tokenAlts = tokens.map(expandTokenExact);
  return { phrases: [...phrases], tokens, tokenAlts };
}

/**
 * Exact-bucket score (no edit-distance).
 * 100 exact name, 95 prefix, 85 name substring, 80 word phrase, 72 hay substring,
 * 50+ token coverage.
 */
function scoreExact(entry: IndexedFood, phrases: string[], tokenAlts: string[][]): number {
  const { name, hay, words, wordSet } = entry;
  let best = 0;

  for (const phrase of phrases) {
    if (!phrase) continue;
    if (name === phrase) best = Math.max(best, 100);
    else if (name.startsWith(phrase)) best = Math.max(best, 95);
    else if (name.includes(phrase)) best = Math.max(best, 85);
    else if (
      (!phrase.includes(' ') && wordSet.has(phrase)) ||
      (phrase.includes(' ') && hasWord(hay, phrase))
    ) {
      best = Math.max(best, 80);
    } else if (hay.includes(phrase)) best = Math.max(best, 72);
  }

  if (tokenAlts.length === 0) return best;

  let allHit = true;
  let coverage = 0;
  for (const alts of tokenAlts) {
    let quality = 0;
    for (const t of alts) {
      if (!t) continue;
      if ((!t.includes(' ') && wordSet.has(t)) || (t.includes(' ') && hasWord(hay, t))) {
        quality = 3;
        break;
      }
      if (t.length >= 3) {
        for (const w of words) {
          if (w.startsWith(t) || (t.startsWith(w) && w.length >= 3)) {
            quality = Math.max(quality, 2);
            break;
          }
        }
      }
      if (quality >= 2) break;
    }
    if (quality < 2) {
      allHit = false;
      break;
    }
    coverage += alts.some((t) => hasWordInSet(wordSet, t) || name.includes(t)) ? 2 : 1;
  }
  if (allHit) best = Math.max(best, 50 + coverage * 8);
  return best;
}

/** Best edit-distance quality for one token against indexed words (1 = hit, 0 = miss). */
function fuzzyTokenHit(token: string, words: string[]): { hit: boolean; dist: number } {
  const budget = typoBudget(token.length);
  if (budget <= 0) return { hit: false, dist: 99 };
  const foldedTok = foldPhonetic(token);
  const first = token[0];
  let bestDist = 99;
  for (const w of words) {
    if (w.length < 4) continue;
    // Same first letter (or phonetic) before paying for Levenshtein.
    if (w[0] !== first && foldPhonetic(w)[0] !== foldedTok[0]) continue;
    if (Math.abs(w.length - token.length) > budget) continue;
    const d = editDistance(token, w);
    if (d < bestDist) bestDist = d;
    if (d <= budget) return { hit: true, dist: d };
    const fd = editDistance(foldedTok, foldPhonetic(w));
    if (fd < bestDist) bestDist = fd;
    if (fd <= budget) return { hit: true, dist: fd };
  }
  return { hit: false, dist: bestDist };
}

/**
 * Fuzzy-bucket score. Lower edit distance ranks higher.
 * Returns 0 if not all tokens can be explained via fuzzy/synonym typo.
 * Tokens matched only via fuzzy synonym keys or edit-distance count as fuzzy.
 */
function scoreFuzzy(
  entry: IndexedFood,
  tokens: string[],
  tokenAlts: string[][],
  fuzzyKeyAlts: string[][],
): number {
  const { words, wordSet, hay } = entry;
  let exactish = 0;
  let fuzzyCount = 0;
  let distPenalty = 0;

  for (let i = 0; i < tokens.length; i++) {
    const alts = tokenAlts[i] ?? [];
    const fuzzyAlts = fuzzyKeyAlts[i] ?? [];
    let quality = 0;
    let dist = 99;

    // Exact/synonym/prefix first (same as exact bucket).
    for (const t of alts) {
      if (!t) continue;
      if ((!t.includes(' ') && wordSet.has(t)) || (t.includes(' ') && hasWord(hay, t))) {
        quality = 3;
        dist = 0;
        break;
      }
      if (t.length >= 3) {
        for (const w of words) {
          if (w.startsWith(t) || (t.startsWith(w) && w.length >= 3)) {
            quality = Math.max(quality, 2);
            dist = 0;
            break;
          }
        }
      }
      if (quality >= 2) break;
    }

    // Synonym-key typos (optium → optimum) count as fuzzy, not exact.
    if (quality < 2) {
      for (const t of fuzzyAlts) {
        if (!t) continue;
        if ((!t.includes(' ') && wordSet.has(t)) || (t.includes(' ') && hasWord(hay, t))) {
          quality = 1;
          dist = 1;
          break;
        }
      }
    }

    // Direct edit-distance against food words.
    if (quality < 2) {
      const fuzzy = fuzzyTokenHit(tokens[i]!, words);
      if (!fuzzy.hit) return 0;
      quality = 1;
      dist = fuzzy.dist;
    }

    if (quality >= 2) exactish += 1;
    else {
      fuzzyCount += 1;
      distPenalty += dist;
    }
  }

  if (fuzzyCount === 0) return 0; // pure exact belongs in exact bucket
  let score = 40 + exactish * 8 + fuzzyCount * 2 - distPenalty * 6;
  // Prefer foods whose leading name token shares the query prefix (Chicken > BBQ chicken pizza).
  const nameToks = entry.name.split(' ');
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    const prefix = tok.slice(0, 3);
    let boosted = false;
    for (let ni = 0; ni < nameToks.length; ni++) {
      const nt = nameToks[ni]!;
      if (nt.length < 3) continue;
      if (!nt.startsWith(prefix) && !tok.startsWith(nt.slice(0, 3))) continue;
      score += ni === 0 ? 14 : 5;
      boosted = true;
      break;
    }
    if (!boosted) continue;
  }
  return Math.max(1, score);
}

function sharesPrefixChar(entry: IndexedFood, tokens: string[]): boolean {
  for (const t of tokens) {
    const c = t[0];
    if (c && entry.prefixChars.includes(c)) return true;
  }
  return false;
}

function sortRanked(a: { score: number; name: string }, b: { score: number; name: string }): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.name.localeCompare(b.name);
}

function rowToFood(row: RemoteFoodRow): CatalogFood | null {
  const name = String(row.name ?? '').trim();
  if (!name) return null;
  const portion = String(row.portion ?? '').trim() || '1 serving';
  const protein_g = Number(row.protein_g);
  const calories_g = Number(row.calories_g);
  if (!Number.isFinite(protein_g) || protein_g < 0) return null;
  if (!Number.isFinite(calories_g) || calories_g < 0) return null;
  const gramsRaw = row.estimated_grams == null ? undefined : Number(row.estimated_grams);
  const estimated_grams =
    gramsRaw != null && Number.isFinite(gramsRaw) && gramsRaw > 0 ? gramsRaw : undefined;
  const aliases = Array.isArray(row.aliases)
    ? row.aliases.map((a) => String(a).trim()).filter(Boolean)
    : undefined;
  return {
    name,
    portion,
    protein_g,
    calories_g,
    estimated_grams,
    aliases: aliases?.length ? aliases : undefined,
    is_common: !!row.is_common,
  };
}

async function readRemoteCache(): Promise<CatalogFood[]> {
  try {
    const raw = await AsyncStorage.getItem(REMOTE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RemoteFoodRow[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(rowToFood).filter((f): f is CatalogFood => !!f);
  } catch {
    return [];
  }
}

async function writeRemoteCache(foods: CatalogFood[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(foods));
  } catch {
    /* ignore */
  }
}

/** Hydrate from disk cache (instant) then network. Safe to call often. */
export async function refreshRemoteFoodCatalog(opts?: {
  force?: boolean;
}): Promise<CatalogFood[]> {
  const force = opts?.force === true;
  const now = Date.now();
  // Reuse a fresh in-memory fetch for 60s unless forced.
  if (!force && remoteFoods.length > 0 && now - remoteLoadedAt < 60_000) {
    return remoteFoods;
  }
  if (!force && remoteFetchInFlight) return remoteFetchInFlight;

  remoteFetchInFlight = (async () => {
    if (remoteFoods.length === 0) {
      const cached = await readRemoteCache();
      if (cached.length) {
        remoteFoods = cached;
        remoteLoadedAt = Date.now();
        invalidateCatalogCaches();
      }
    }

    try {
      const { data, error } = await supabase
        .from('food_catalog')
        .select('name, portion, protein_g, calories_g, estimated_grams, aliases, is_common')
        .eq('active', true)
        .order('name', { ascending: true })
        .limit(5000);
      if (error) throw error;
      const next = (data ?? [])
        .map((row) => rowToFood(row as RemoteFoodRow))
        .filter((f): f is CatalogFood => !!f);
      remoteFoods = next;
      remoteLoadedAt = Date.now();
      invalidateCatalogCaches();
      void writeRemoteCache(next);
      return next;
    } catch (e) {
      console.warn('Remote food catalog fetch failed:', e);
      return remoteFoods;
    } finally {
      remoteFetchInFlight = null;
    }
  })();

  return remoteFetchInFlight;
}

/** Merge bundled + remote. Remote wins on same name (fix macros / portion live). */
export function allCatalogFoods(): CatalogFood[] {
  if (
    mergedAllCache &&
    mergedAllRemoteRef === remoteFoods &&
    mergedAllHeavyRef === heavyFoods
  ) {
    return mergedAllCache;
  }
  const byName = new Map<string, CatalogFood>();
  for (const food of FOOD_CATALOG) {
    byName.set(normalize(food.name), food);
  }
  if (heavyFoods) {
    for (const food of heavyFoods) {
      byName.set(normalize(food.name), food);
    }
  }
  for (const food of remoteFoods) {
    byName.set(normalize(food.name), food);
  }
  mergedAllCache = [...byName.values()];
  mergedAllRemoteRef = remoteFoods;
  mergedAllHeavyRef = heavyFoods;
  return mergedAllCache;
}

/** Alphabetically sorted catalog for browse-more (cached). */
export function getSortedBrowseCatalog(): CatalogFood[] {
  if (
    sortedBrowseCache &&
    sortedBrowseRemoteRef === remoteFoods &&
    sortedBrowseHeavyRef === heavyFoods
  ) {
    return sortedBrowseCache;
  }
  sortedBrowseCache = [...allCatalogFoods()].sort((a, b) => a.name.localeCompare(b.name));
  sortedBrowseRemoteRef = remoteFoods;
  sortedBrowseHeavyRef = heavyFoods;
  return sortedBrowseCache;
}

/** COMMON staples + remote rows flagged is_common. */
export function commonCatalogFoods(): CatalogFood[] {
  if (mergedCommonCache && mergedCommonRemoteRef === remoteFoods) {
    return mergedCommonCache;
  }
  const byName = new Map<string, CatalogFood>();
  for (const food of COMMON_FOODS) {
    byName.set(normalize(food.name), food);
  }
  for (const food of remoteFoods) {
    if (!food.is_common) continue;
    byName.set(normalize(food.name), food);
  }
  mergedCommonCache = [...byName.values()];
  mergedCommonRemoteRef = remoteFoods;
  return mergedCommonCache;
}

/** Phase A only: exact / prefix / substring / synonym (no edit-distance). */
export function searchCatalogExact(query: string): CatalogFood[] {
  const q = normalize(query);
  const index = getIndexedFoods();
  if (!q) {
    return index.slice(0, RESULT_CAP).map((e) => e.food);
  }

  const { phrases, tokens, tokenAlts } = expandQuery(q);
  const candidates = exactSearchCandidates(q, tokens, index);
  const exactHits: { food: CatalogFood; score: number; name: string }[] = [];

  for (const entry of candidates) {
    if (!mightMatchExact(entry, q, tokens)) continue;
    const score = scoreExact(entry, phrases, tokenAlts);
    if (score <= 0) continue;
    exactHits.push({ food: entry.food, score, name: entry.name });
  }
  exactHits.sort(sortRanked);
  return exactHits.slice(0, EXACT_CAP).map((r) => r.food);
}

/** Instant filter for the small recent-foods list (no full catalog scan). */
export function filterRecentCatalogFoods(foods: CatalogFood[], query: string): CatalogFood[] {
  const q = normalize(query);
  if (!q) return [];
  const out: CatalogFood[] = [];
  for (const food of foods) {
    const name = normalize(food.name);
    if (name.includes(q) || name.startsWith(q)) {
      out.push(food);
      continue;
    }
    if (food.aliases?.some((a) => normalize(a).includes(q))) out.push(food);
  }
  return out;
}

/**
 * Phase B only: fuzzy typos when query length >= 3.
 * Pass exact names to exclude (from searchCatalogExact).
 */
export function searchCatalogSimilar(
  query: string,
  exact: CatalogFood[] = [],
): CatalogFood[] {
  const q = normalize(query);
  if (!q || q.length < FUZZY_MIN_QUERY_LEN) return [];
  if (exact.length >= EXACT_CAP) return [];

  const index = getIndexedFoods();
  const { tokens, tokenAlts } = expandQuery(q);
  const exactNames = new Set(exact.map((f) => normalize(f.name)));
  const fuzzyKeyAlts = tokens.map(expandTokenFuzzyKeys);
  const similarHits: { food: CatalogFood; score: number; name: string }[] = [];
  let candidatesChecked = 0;

  for (const entry of index) {
    if (exactNames.has(entry.name)) continue;
    if (!sharesPrefixChar(entry, tokens)) continue;
    candidatesChecked += 1;
    if (candidatesChecked > FUZZY_CANDIDATE_CAP && similarHits.length >= SIMILAR_CAP) break;
    const score = scoreFuzzy(entry, tokens, tokenAlts, fuzzyKeyAlts);
    if (score <= 0) continue;
    similarHits.push({ food: entry.food, score, name: entry.name });
  }
  similarHits.sort(sortRanked);
  const similarCap = Math.min(SIMILAR_CAP, RESULT_CAP - exact.length);
  return similarHits.slice(0, similarCap).map((r) => r.food);
}

/**
 * Two-phase search:
 * A) exact / prefix / substring / synonym tokens (instant, no edit-distance)
 * B) fuzzy typos only when query length >= 3, capped candidates
 *
 * Ranking within exact: name startsWith > all tokens as words > substring.
 * Similar bucket ordered by edit-distance likelihood.
 */
export function searchCatalogGrouped(query: string): CatalogSearchBuckets {
  const exact = searchCatalogExact(query);
  const similar = searchCatalogSimilar(query, exact);
  return { exact, similar };
}

/** Flat list: exact matches first, then similar. Cap ~72. */
export function searchCatalog(query: string): CatalogFood[] {
  const { exact, similar } = searchCatalogGrouped(query);
  return [...exact, ...similar].slice(0, RESULT_CAP);
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
