export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type GoalType = 'maintain' | 'build_muscle' | 'lose_fat';
export type Confidence = 'low' | 'medium' | 'high';

export interface Profile {
  id: string;
  age: number | null;
  weight_kg: number | null;
  sex: Sex | null;
  activity_level: ActivityLevel | null;
  goal_type: GoalType | null;
  protein_goal_g: number | null;
  onboarded: boolean;
  is_premium: boolean;
}

export interface FoodItem {
  name: string;
  portion: string;
  protein_g: number;
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
