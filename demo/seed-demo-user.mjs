// Seed an anonymous demo user: onboarded profile near level-up + 6 days of trend logs.
// Used by demo/record-demo.mjs for a reliable ~45s product video.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';
export const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const TREND_TOTALS = [92, 108, 85, 115, 98, 102];
const DEMO_GOAL_G = 40;
/** Level 4 XP — one goal hit (+100) + ~42g meal pushes to level 5 (evolution). */
const SEED_XP = 571;

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function mockAnalysis() {
  return {
    is_food: true,
    food_name: 'Grilled chicken with kale',
    items: [
      {
        name: 'Grilled chicken breast',
        portion: '1 serving',
        estimated_grams: 140,
        protein_g: 38,
        confidence: 'high',
      },
      {
        name: 'Kale',
        portion: '1 cup',
        estimated_grams: 70,
        protein_g: 4,
        confidence: 'medium',
      },
    ],
    total_protein_g: 42,
    calories: 310,
    confidence: 'high',
    notes: 'Demo mock — grilled chicken and kale on a blue plate.',
  };
}

export async function seedDemoUser() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signIn, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;

  const session = signIn.session;
  const userId = signIn.user.id;
  const today = todayISO();
  const yesterday = todayISO(-1);

  const dragonProgress = {
    xp: SEED_XP,
    level: 4,
    streak: 6,
    best_streak: 8,
    goals_hit: 5,
    last_goal_date: yesterday,
  };

  const profile = {
    id: userId,
    age: 28,
    weight_kg: 72,
    sex: 'female',
    activity_level: 'moderate',
    goal_type: 'build_muscle',
    protein_goal_g: DEMO_GOAL_G,
    onboarded: true,
    intro_completed: true,
    is_premium: false,
    paywall_dismissed: false,
    weight_unit: 'kg',
    active_dragon_id: 'fire',
    daily_dragon_id: 'fire',
    daily_dragon_date: today,
    dragon_progress: { fire: dragonProgress },
    xp: SEED_XP,
    streak: dragonProgress.streak,
    best_streak: dragonProgress.best_streak,
    goals_hit: dragonProgress.goals_hit,
    last_goal_date: dragonProgress.last_goal_date,
  };

  const { error: profileError } = await supabase.from('profiles').upsert(profile);
  if (profileError) throw profileError;

  const logs = TREND_TOTALS.map((protein_g, i) => ({
    user_id: userId,
    logged_date: todayISO(-(TREND_TOTALS.length - i)),
    food_name: 'Demo meal',
    items: [{ name: 'Demo meal', portion: '1 serving', protein_g, confidence: 'medium' }],
    protein_g,
    calories: Math.round(protein_g * 8),
    confidence: 'medium',
    image_path: null,
    source: 'photo',
  }));

  const { error: logsError } = await supabase.from('protein_logs').insert(logs);
  if (logsError) throw logsError;

  return { session, userId, storageKey: STORAGE_KEY, goalG: DEMO_GOAL_G };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeded = await seedDemoUser();
  console.log('Seeded demo user:', seeded.userId);
  console.log('Goal:', seeded.goalG, 'g · XP:', SEED_XP, '· Trend days:', TREND_TOTALS.length);
}
