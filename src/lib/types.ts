export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type GoalType = 'maintain' | 'build_muscle' | 'lose_fat';
export type Confidence = 'low' | 'medium' | 'high';
export type DragonId = 'fire' | 'ice' | 'forest';

export interface DragonProgress {
  xp: number;
  /** Derived from XP; stored for quick reads. */
  level?: number;
  streak: number;
  best_streak: number;
  goals_hit: number;
  last_goal_date: string | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  invite_code: string | null;
  age: number | null;
  weight_kg: number | null;
  sex: Sex | null;
  activity_level: ActivityLevel | null;
  goal_type: GoalType | null;
  protein_goal_g: number | null;
  onboarded: boolean;
  intro_completed: boolean;
  is_premium: boolean;
  paywall_dismissed: boolean;
  /** @deprecated use dragon_progress */
  xp: number;
  /** @deprecated use dragon_progress */
  streak: number;
  /** @deprecated use dragon_progress */
  best_streak: number;
  /** @deprecated use dragon_progress */
  goals_hit: number;
  /** @deprecated use dragon_progress */
  last_goal_date: string | null;
  weight_unit: 'kg' | 'lbs';
  active_dragon_id: DragonId | null;
  /** Dragon locked for today - all logs count toward this dragon only. */
  daily_dragon_id: DragonId | null;
  /** ISO date (YYYY-MM-DD) when daily_dragon_id was chosen. */
  daily_dragon_date: string | null;
  dragon_progress: Partial<Record<DragonId, DragonProgress>>;
}

export interface FoodItem {
  name: string;
  portion: string;
  /** Visual size estimate in grams - protein scales with this, not food type alone. */
  estimated_grams?: number;
  protein_g: number;
  confidence?: Confidence;
}

export interface Analysis {
  is_food: boolean;
  food_name: string;
  items: FoodItem[];
  total_protein_g: number;
  calories: number;
  confidence: Confidence;
  notes: string;
}

export interface ProteinLog {
  id: string;
  user_id: string;
  created_at: string;
  logged_date: string;
  food_name: string;
  items: FoodItem[];
  protein_g: number;
  calories: number | null;
  confidence: Confidence | null;
  image_path: string | null;
  source: 'photo' | 'manual';
}
