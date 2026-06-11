/**
 * Capture Play Store phone screenshots (1080x1920) from the web app.
 *
 * Usage:
 *   APP_URL=https://proteinquest.vercel.app node demo/generate-play-screenshots.mjs
 *   APP_URL=http://127.0.0.1:4173 npx serve dist -l 4173  # local preview first
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_URL ?? 'https://proteinquest.vercel.app';
const OUT_DIR = process.env.OUT_DIR ?? 'demo/play-store-screenshots';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';
const AUTH_STORAGE_KEY = 'sb-csxdkvpvcasuknhnprxp-auth-token';

const VIEWPORT = { width: 1080, height: 1920 };

const SCREENS = [
  { name: '01-today', path: '/today', waitFor: 'TODAY' },
  { name: '02-trends', path: '/trends', waitFor: 'TRENDS' },
  { name: '03-intro', path: '/intro', waitFor: 'Snap meals' },
];

async function seedDemoUser() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr || !auth.session) throw new Error(`Auth failed: ${authErr?.message}`);

  const userId = auth.user.id;
  const today = new Date().toISOString().slice(0, 10);

  await supabase.from('protein_logs').delete().eq('user_id', userId).eq('logged_date', today);

  const foods = [
    ['Grilled Chicken Salad', 42],
    ['Greek Yogurt Bowl', 28],
    ['Protein Shake', 35],
    ['Salmon Rice Bowl', 38],
  ];

  await supabase.from('profiles').upsert({
    id: userId,
    intro_completed: true,
    onboarded: true,
    protein_goal_g: 180,
    active_dragon_id: 'forest',
    daily_dragon_id: 'forest',
    daily_dragon_date: today,
    dragon_progress: {
      forest: { xp: 120, level: 2, streak: 3, best_streak: 5, goals_hit: 4, last_goal_date: today },
    },
    age: 28,
    weight_kg: 80,
    sex: 'male',
    activity_level: 'active',
    goal_type: 'build_muscle',
    weight_unit: 'kg',
    is_premium: false,
    paywall_dismissed: false,
    xp: 120,
    streak: 3,
    best_streak: 5,
    goals_hit: 4,
    last_goal_date: today,
  });

  for (const [food, protein] of foods) {
    await supabase.from('protein_logs').insert({
      user_id: userId,
      logged_date: today,
      food_name: food,
      items: [{ name: food, protein_g: protein, calories: 320 }],
      protein_g: protein,
      calories: 320,
      confidence: 'high',
      source: 'manual',
    });
  }

  return auth.session;
}

async function injectSession(page, session) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: AUTH_STORAGE_KEY,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    },
  );
}

async function captureScreen(page, screen) {
  await page.goto(`${APP}${screen.path}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByText(screen.waitFor, { exact: false }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const file = join(OUT_DIR, `${screen.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`Saved ${file}`);
  return file;
}

await mkdir(OUT_DIR, { recursive: true });

const session = await seedDemoUser();
console.log('Seeded demo user for screenshots');

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await injectSession(page, session);

const files = [];
for (const screen of SCREENS) {
  files.push(await captureScreen(page, screen));
}

await browser.close();

const manifest = {
  generatedAt: new Date().toISOString(),
  appUrl: APP,
  viewport: VIEWPORT,
  files,
  notes: 'Upload portrait PNGs to Play Console → Store listing → Phone screenshots',
};

await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('\nDone.', JSON.stringify(manifest, null, 2));
