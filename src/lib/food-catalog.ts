import AsyncStorage from '@react-native-async-storage/async-storage';

import { BRAND_FOODS } from './food-catalog-brands';
import { EXTRA_FOODS } from './food-catalog-extra';
import { MEAL_FOODS } from './food-catalog-meals';
import { MEGA_FOODS } from './food-catalog-mega';
import { MORE_FOODS } from './food-catalog-more';
import { WORLD_FOODS } from './food-catalog-world';
import { supabase } from './supabase';

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
    aliases: ['indian cottage cheese', 'panir'],
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
  ...EXTRA_FOODS,
  ...MORE_FOODS,
  ...WORLD_FOODS,
  ...BRAND_FOODS,
  ...MEAL_FOODS,
  ...MEGA_FOODS,
];

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
  chicken: ['chick', 'poultry', 'chicken breast'],
  chick: ['chicken'],
  'chicken breast': ['chicken', 'breast'],
  paneer: ['indian cottage cheese', 'panir'],
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
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

const SYNONYM_KEYS = Object.keys(SEARCH_SYNONYMS);

function expandToken(token: string): string[] {
  const t = token.trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  const syns = SEARCH_SYNONYMS[t];
  if (syns) for (const s of syns) out.add(s);
  // Light stemming: eggs→egg, bars→bar, scoops→scoop
  if (t.length > 3 && t.endsWith('ies')) out.add(`${t.slice(0, -3)}y`);
  if (t.length > 3 && t.endsWith('es')) out.add(t.slice(0, -2));
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) out.add(t.slice(0, -1));
  // Typo tolerance against known synonym keys (optium → optimum).
  if (t.length >= 5) {
    const maxDist = t.length >= 7 ? 2 : 1;
    for (const key of SYNONYM_KEYS) {
      if (key.includes(' ')) continue;
      if (Math.abs(key.length - t.length) > maxDist) continue;
      if (editDistance(t, key) <= maxDist) {
        out.add(key);
        // Skip tiny aliases (on/mp/pb) from typo path so "optium" ≠ "beans on toast".
        for (const s of SEARCH_SYNONYMS[key] ?? []) {
          if (s.length > 2) out.add(s);
        }
      }
    }
  }
  return [...out];
}

/** Expand a full query into alternate phrasings + tokens. */
function expandQuery(q: string): { phrases: string[]; tokens: string[][] } {
  const phrases = new Set<string>([q]);
  // Multi-word synonym keys (longest first).
  const keys = Object.keys(SEARCH_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (!q.includes(key)) continue;
    for (const alt of SEARCH_SYNONYMS[key] ?? []) {
      phrases.add(normalize(q.split(key).join(alt)));
    }
  }
  const rawTokens = q.split(' ').filter(Boolean);
  const tokens = rawTokens.map(expandToken);
  return { phrases: [...phrases], tokens };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word / whole-phrase match (avoids "on isolate" hitting "protein isolate"). */
function hasWord(hay: string, needle: string): boolean {
  if (!needle) return true;
  const parts = needle.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;
  const pattern = parts.map(escapeRegExp).join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`).test(hay);
}

function haystackFor(food: CatalogFood): string {
  const parts = [food.name, ...(food.aliases ?? [])];
  // Auto brand/food expansions baked into the searchable text.
  const auto: string[] = [];
  const nameN = normalize(food.name);
  for (const [key, syns] of Object.entries(SEARCH_SYNONYMS)) {
    if (hasWord(nameN, key) || syns.some((s) => hasWord(nameN, s))) {
      auto.push(key, ...syns);
    }
  }
  return [...parts, ...auto].map(normalize).join(' · ');
}

function tokenInHay(token: string, hay: string): boolean {
  if (!token) return true;
  if (hasWord(hay, token)) return true;
  // Prefix match on a haystack word (e.g. "opti" → "optimum").
  if (token.length >= 3) {
    const words = hay.split(/[^a-z0-9]+/);
    if (words.some((w) => w.startsWith(token) || (token.startsWith(w) && w.length >= 3))) {
      return true;
    }
  }
  return false;
}

function scoreMatch(food: CatalogFood, q: string): number {
  if (!q) return 1;
  const name = normalize(food.name);
  const hay = haystackFor(food);
  const { phrases, tokens } = expandQuery(q);

  let best = 0;
  for (const phrase of phrases) {
    if (!phrase) continue;
    if (name === phrase) best = Math.max(best, 100);
    else if (name.startsWith(phrase)) best = Math.max(best, 90);
    else if (hasWord(hay, phrase)) best = Math.max(best, 75);
  }

  // All query tokens must match (via synonyms / prefix).
  if (tokens.length > 0 && tokens.every((alts) => alts.some((t) => tokenInHay(t, hay)))) {
    const coverage = tokens.reduce((s, alts) => {
      if (alts.some((t) => hasWord(name, t))) return s + 2;
      return s + 1;
    }, 0);
    best = Math.max(best, 40 + coverage * 8);
  }

  return best;
}

function matchesQuery(food: CatalogFood, q: string): boolean {
  return scoreMatch(food, q) > 0;
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
  const byName = new Map<string, CatalogFood>();
  for (const food of FOOD_CATALOG) {
    byName.set(normalize(food.name), food);
  }
  for (const food of remoteFoods) {
    byName.set(normalize(food.name), food);
  }
  return [...byName.values()];
}

/** COMMON staples + remote rows flagged is_common. */
export function commonCatalogFoods(): CatalogFood[] {
  const byName = new Map<string, CatalogFood>();
  for (const food of COMMON_FOODS) {
    byName.set(normalize(food.name), food);
  }
  for (const food of remoteFoods) {
    if (!food.is_common) continue;
    byName.set(normalize(food.name), food);
  }
  return [...byName.values()];
}

export function searchCatalog(query: string): CatalogFood[] {
  const q = normalize(query);
  const all = allCatalogFoods();
  if (!q) return all.slice(0, 100);
  const ranked: { food: CatalogFood; score: number }[] = [];
  for (const food of all) {
    const score = scoreMatch(food, q);
    if (score <= 0) continue;
    ranked.push({ food, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.food.name.localeCompare(b.food.name);
  });
  return ranked.map((r) => r.food).slice(0, 100);
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
