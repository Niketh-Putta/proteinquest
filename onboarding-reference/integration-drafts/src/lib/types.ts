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

/** Client-persisted retention extras (loot, freeze, care days). */
export interface RetentionState {
  /** Onboarding answers and editable nutrition preferences, owned by the profile user. */
  onboarding?: Record<string, string | number | boolean>;
  loot_meals_since_drop?: number;
  egg_shards?: number;
  streak_freeze_week?: string | null;
  care_days?: string[];
  /** User calorie aim (kcal/day). Prefer this over derived estimate. */
  calorie_goal_kcal?: number;
  /** Today's care checklist XP already paid (per task, per calendar day). */
  care_xp?: {
    date: string;
    steps: [boolean, boolean, boolean];
  };
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
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
  /** Set by Supabase on profile insert — used for the 1-day habit grace period. */
  created_at?: string | null;
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
  /** User-chosen names keyed by dragon id; falls back to species name when missing. */
  dragon_names?: Partial<Record<DragonId, string>>;
  /** Loot / streak-freeze / care-day state. */
  retention?: RetentionState;
}

export interface ProteinDuel {
  id: string;
  challenger_id: string;
  opponent_id: string;
  start_date: string;
  end_date: string;
  challenger_protein: number;
  opponent_protein: number;
  status: 'active' | 'completed' | 'declined';
  created_at: string;
}

export interface FoodItem {
  name: string;
  portion: string;
  /** Visual size estimate in grams - protein scales with this, not food type alone. */
  estimated_grams?: number;
  protein_g: number;
  /** Per-item calories when available from analysis. */
  calories_g?: number;
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
  source: 'photo' | 'manual' | 'photo_scan';
}
