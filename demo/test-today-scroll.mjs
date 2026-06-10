// Verify Today tab food log scrolling at wide + mobile viewports.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';
const AUTH_STORAGE_KEY = 'sb-csxdkvpvcasuknhnprxp-auth-token';

const FOODS = [
  'Grilled Chicken and Kale Salad',
  'Greek Yogurt with Berries',
  'Salmon Rice Bowl',
  'Protein Shake',
  'Scrambled Eggs',
  'Turkey Wrap',
  'Cottage Cheese',
  'Tuna Salad',
  'Beef Stir Fry',
];

async function setupUserWithLogs() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr || !auth.session) throw new Error(`Auth failed: ${authErr?.message}`);

  const userId = auth.user.id;
  const today = new Date().toISOString().slice(0, 10);

  await supabase.from('protein_logs').delete().eq('user_id', userId).eq('logged_date', today);

  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: userId,
    intro_completed: true,
    onboarded: true,
    protein_goal_g: 182,
    active_dragon_id: 'forest',
    daily_dragon_id: 'forest',
    daily_dragon_date: today,
    dragon_progress: {
      forest: { xp: 0, level: 1, streak: 0, best_streak: 0, goals_hit: 0, last_goal_date: null },
    },
    age: 28,
    weight_kg: 80,
    sex: 'male',
    activity_level: 'active',
    goal_type: 'build_muscle',
    weight_unit: 'kg',
    is_premium: false,
    paywall_dismissed: false,
    xp: 0,
    streak: 0,
    best_streak: 0,
    goals_hit: 0,
    last_goal_date: null,
  });
  if (profileErr) throw new Error(`Profile upsert failed: ${profileErr.message}`);

  for (const [i, food] of FOODS.entries()) {
    const { error } = await supabase.from('protein_logs').insert({
      user_id: userId,
      logged_date: today,
      food_name: food,
      items: [{ name: food, protein_g: 20 + i, calories: 200 }],
      protein_g: 20 + i,
      calories: 200,
      confidence: 'high',
      source: 'manual',
    });
    if (error) throw new Error(`Log insert failed: ${error.message}`);
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
  await page.goto(`${APP}/today`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3000);
}

async function measureScroll(page, label) {
  await page.getByText('LOGGED TODAY').waitFor({ timeout: 30000 });

  const metrics = await page.evaluate(() => {
    const scrollables = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return (
        (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 2
      );
    });

    const tabBar = [...document.querySelectorAll('*')].find((el) => {
      const t = el.textContent ?? '';
      return t.includes('TODAY') && t.includes('SCAN') && t.includes('TRENDS');
    });

    function rect(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    }

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollableCount: scrollables.length,
      scrollableSizes: scrollables.slice(0, 3).map((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })),
      tabBar: rect(tabBar),
    };
  });

  const before = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((n) => {
      const s = getComputedStyle(n);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 2;
    });
    return el ? el.scrollTop : -1;
  });

  await page.mouse.move(metrics.viewport.w / 2, metrics.viewport.h * 0.55);
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((n) => {
      const s = getComputedStyle(n);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 2;
    });
    return el ? el.scrollTop : -1;
  });

  const scrolled = before >= 0 && after > before + 20;

  const lastItemVsTabBar = await page.evaluate(() => {
    const tabBar = [...document.querySelectorAll('*')].find((el) => {
      const txt = el.textContent ?? '';
      return txt.includes('TODAY') && txt.includes('SCAN') && txt.includes('TRENDS');
    });
    if (!tabBar) return null;
    const tabTop = tabBar.getBoundingClientRect().top;

    const el = [...document.querySelectorAll('*')].find(
      (n) => n.textContent?.trim() === 'Beef Stir Fry' && n.children.length === 0,
    );
    if (!el) return { found: false, tabTop };
    const r = el.getBoundingClientRect();
    return {
      found: true,
      lastItemBottom: r.bottom,
      tabTop,
      clearsTabBar: r.bottom <= tabTop - 4,
      visibleInViewport: r.top >= 0 && r.bottom <= tabTop,
    };
  });

  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify({ metrics, before, after, scrolled, lastItemVsTabBar }, null, 2));

  return { scrolled, metrics, lastItemVsTabBar };
}

const session = await setupUserWithLogs();
console.log('Seeded user with', FOODS.length, 'logs');

const browser = await chromium.launch();
const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'wide-960', width: 960, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

const results = [];

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await injectSession(page, session);

  const hasLogs = await page.getByText('LOGGED TODAY').isVisible().catch(() => false);
  console.log(`${vp.name}: LOGGED TODAY=${hasLogs}`);

  const result = await measureScroll(page, vp.name);
  await page.screenshot({ path: `demo/today-scroll-${vp.name}.png` });
  results.push({ viewport: vp.name, hasLogs, ...result });
  await ctx.close();
}

await browser.close();

const summary = results.map((r) => ({
  viewport: r.viewport,
  hasLogs: r.hasLogs,
  scrolled: r.scrolled,
  scrollableCount: r.metrics.scrollableCount,
  lastItemVisible: r.lastItemVsTabBar,
}));

console.log('\nSUMMARY:', JSON.stringify(summary, null, 2));

const failed = summary.filter((r) => !r.hasLogs || !r.scrolled || r.scrollableCount === 0);
if (failed.length) process.exit(1);
