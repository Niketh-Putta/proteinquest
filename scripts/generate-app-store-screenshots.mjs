#!/usr/bin/env node
/**
 * Marketing App Store screenshots (1290×2796) — LOCKED-style layouts:
 * gradient backdrop, bold headline, device frame, no stretch.
 *
 * Source phone captures: store/screenshots/0*.png (1080×1920)
 * Output: store/screenshots/iphone67/01.png … 05.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const W = 1290;
const H = 2796;

const RAW_DIR = path.join(ROOT, 'store/screenshots/raw');
const APP = process.env.APP_URL ?? 'http://localhost:8081';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';
const AUTH_STORAGE_KEY = 'sb-csxdkvpvcasuknhnprxp-auth-token';

const CAPTURES = [
  { name: 'today.png', path: '/today', wait: 'PROTEIN TODAY' },
  { name: 'trends.png', path: '/trends', wait: 'Rhythm' },
  { name: 'scan.png', path: '/scan', wait: 'Scan meal' },
  { name: 'league.png', path: '/league', wait: 'Leaderboard' },
  { name: 'intro.png', path: '/intro', wait: 'Get started' },
];

const SLIDES = [
  {
    out: '01.png',
    src: 'today.png',
    headline: ['Hit your', 'protein goal', 'every day'],
    accentLine: 1,
    sub: 'Snap meals. Track protein. Grow your dragon.',
    subAccent: 'dragon',
    bg: 'warm',
    phoneScale: 0.66,
    phoneY: 0.56,
  },
  {
    out: '02.png',
    src: 'scan.png',
    headline: ['Just take', 'a photo'],
    accentLine: 1,
    sub: 'AI identifies your meal in seconds.',
    subAccent: 'seconds',
    bg: 'ember',
    phoneScale: 0.64,
    phoneY: 0.57,
    tilt: -3,
  },
  {
    out: '03.png',
    src: 'trends.png',
    headline: ['See your', 'protein', 'rhythm'],
    accentLine: 1,
    sub: 'Trends and streaks keep you consistent.',
    subAccent: 'consistent',
    bg: 'forest',
    phoneScale: 0.65,
    phoneY: 0.56,
    tilt: 2,
  },
  {
    out: '04.png',
    src: 'intro.png',
    headline: ['Choose your', 'dragon'],
    accentLine: 1,
    sub: 'Ember, Frost, or Moss — pick your companion.',
    subAccent: 'companion',
    bg: 'violet',
    phoneScale: 0.66,
    phoneY: 0.56,
  },
  {
    out: '05.png',
    src: 'league.png',
    headline: ['Challenge', 'your friends'],
    accentLine: 1,
    sub: 'Climb the leaderboard and stay accountable.',
    subAccent: 'accountable',
    bg: 'warm',
    phoneScale: 0.65,
    phoneY: 0.56,
  },
];

function slideHtml(slide, phoneDataUrl) {
  const accentIdx = slide.accentLine ?? 1;
  const headlineHtml = slide.headline
    .map((line, i) =>
      i === accentIdx
        ? `<span class="accent">${line}</span>`
        : `<span class="plain">${line}</span>`,
    )
    .join('<br/>');

  const subParts = slide.sub.split(slide.subAccent);
  const subHtml =
    subParts.length > 1
      ? `${subParts[0]}<span class="accent-inline">${slide.subAccent}</span>${subParts[1] ?? ''}`
      : slide.sub;

  const tilt = slide.tilt ?? 0;
  const phoneW = Math.round(W * slide.phoneScale);
  const phoneH = Math.round(phoneW * (1920 / 1080));
  const phoneTop = Math.round(H * slide.phoneY - phoneH / 2);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: 'Sora', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .canvas { position: relative; width: ${W}px; height: ${H}px; }

  .bg-warm {
    background: radial-gradient(120% 80% at 50% 0%, #2a1810 0%, #0c0b10 45%, #08070c 100%);
  }
  .bg-ember {
    background: radial-gradient(110% 70% at 30% 0%, #3d1a12 0%, #120e14 50%, #0a090e 100%);
  }
  .bg-forest {
    background: radial-gradient(100% 75% at 70% 0%, #142318 0%, #0c0f10 48%, #08090c 100%);
  }
  .bg-violet {
    background: radial-gradient(105% 72% at 50% 0%, #1e1638 0%, #0e0c14 50%, #08070c 100%);
  }

  .glow {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 55% 35% at 50% 78%, rgba(255,122,89,0.14) 0%, transparent 70%);
  }
  .orb {
    position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.35;
  }
  .orb-a { width: 420px; height: 420px; background: #ff7a59; top: 120px; right: -80px; }
  .orb-b { width: 320px; height: 320px; background: #9b8cff; bottom: 200px; left: -60px; opacity: 0.22; }

  .header {
    position: absolute; top: 0; left: 0; right: 0;
    padding: 88px 72px 0;
    text-align: center; z-index: 2;
  }
  .brand {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    margin-bottom: 36px;
  }
  .brand img { width: 52px; height: 52px; border-radius: 12px; }
  .brand span {
    font-size: 28px; font-weight: 700; letter-spacing: 0.18em;
    color: #f6f4f8; text-transform: uppercase;
  }
  .headline {
    font-size: 92px; font-weight: 800; line-height: 1.05;
    letter-spacing: -0.03em;
  }
  .headline .plain { color: #f6f4f8; display: block; }
  .headline .accent {
    display: block;
    background: linear-gradient(135deg, #ffb454 0%, #ff7a59 45%, #e85f42 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub {
    margin-top: 28px; font-size: 34px; font-weight: 500; line-height: 1.35;
    color: rgba(246,244,248,0.72); max-width: 920px; margin-left: auto; margin-right: auto;
  }
  .accent-inline { color: #ff9b82; font-weight: 700; }

  .phone-wrap {
    position: absolute; left: 50%; top: ${phoneTop}px;
    width: ${phoneW}px; height: ${phoneH}px;
    transform: translateX(-50%) rotate(${tilt}deg);
    z-index: 1;
  }
  .phone-shadow {
    position: absolute; inset: 18px 24px -8px 24px;
    background: rgba(0,0,0,0.55); filter: blur(36px); border-radius: 48px;
  }
  .phone-frame {
    position: relative; width: 100%; height: 100%;
    border-radius: 52px; padding: 14px;
    background: linear-gradient(145deg, #3a3648 0%, #1a1824 40%, #0f0e14 100%);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.08),
      0 32px 80px rgba(0,0,0,0.65),
      inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .phone-screen {
    width: 100%; height: 100%; border-radius: 40px; overflow: hidden;
    background: #0c0b10;
  }
  .phone-screen img {
    width: 100%; height: 100%; object-fit: cover; object-position: top center;
    display: block;
  }
  .notch {
    position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
    width: 140px; height: 36px; background: #000; border-radius: 20px; z-index: 3;
  }
</style>
</head>
<body>
<div class="canvas bg-${slide.bg}">
  <div class="orb orb-a"></div>
  <div class="orb orb-b"></div>
  <div class="glow"></div>
  <div class="header">
    <div class="brand">
      <img src="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'store/icon-512.png')).toString('base64')}" alt=""/>
      <span>ProteinQuest</span>
    </div>
    <div class="headline">${headlineHtml}</div>
    <p class="sub">${subHtml}</p>
  </div>
  <div class="phone-wrap">
    <div class="phone-shadow"></div>
    <div class="phone-frame">
      <div class="notch"></div>
      <div class="phone-screen">
        <img src="${phoneDataUrl}" alt=""/>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function seedDemoUser() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: auth, error } = await supabase.auth.signInAnonymously();
  if (error || !auth.session) throw new Error(`Auth failed: ${error?.message}`);
  const userId = auth.user.id;
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from('protein_logs').delete().eq('user_id', userId).eq('logged_date', today);
  await supabase.from('profiles').upsert({
    id: userId,
    intro_completed: true,
    onboarded: true,
    protein_goal_g: 150,
    active_dragon_id: 'fire',
    daily_dragon_id: 'fire',
    daily_dragon_date: today,
    dragon_progress: {
      fire: { xp: 1250, level: 4, streak: 5, best_streak: 7, goals_hit: 12, last_goal_date: today },
    },
    is_premium: true,
    paywall_dismissed: true,
    xp: 1250,
    streak: 5,
    display_name: 'Demo',
  });
  for (const [food, protein] of [
    ['Grilled Chicken Salad', 47],
    ['Greek Yogurt Bowl', 28],
    ['Protein Shake', 35],
  ]) {
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
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
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

async function captureRawUi(page) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  for (const cap of CAPTURES) {
    const outPath = path.join(RAW_DIR, cap.name);
    try {
      if (cap.name === 'scan.png') {
        await page.goto(`${APP}/scan`, { waitUntil: 'networkidle', timeout: 60000 });
        const meal = path.join(ROOT, 'demo/meal-scan.jpg');
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          page.getByLabel('Upload from library').click(),
        ]);
        await chooser.setFiles(meal);
        await page.getByText(/Analyzing|Counting protein|Confirm|Log it/i).first().waitFor({ timeout: 30000 });
      } else {
        await page.goto(`${APP}${cap.path}`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.getByText(cap.wait, { exact: false }).first().waitFor({ timeout: 15000 });
      }
      await page.waitForTimeout(cap.name === 'scan.png' ? 1200 : 800);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  captured ${cap.name}`);
    } catch (err) {
      console.warn(`  skip ${cap.name}: ${err.message?.slice(0, 80)}`);
    }
  }
}

async function main() {
  const outDir = path.join(ROOT, 'store/screenshots/iphone67');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const browser = await chromium.launch();
  const capturePage = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  console.log('Capturing raw UI from', APP);
  const session = await seedDemoUser();
  await injectSession(capturePage, session);
  await captureRawUi(capturePage);
  await capturePage.close();

  const page = await browser.newPage({ viewport: { width: W, height: H } });

  for (const slide of SLIDES) {
    const srcPath = path.join(RAW_DIR, slide.src);
    if (!fs.existsSync(srcPath)) throw new Error(`Missing ${srcPath}`);
    const phoneDataUrl = `data:image/png;base64,${fs.readFileSync(srcPath).toString('base64')}`;
    await page.setContent(slideHtml(slide, phoneDataUrl), { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const outPath = path.join(outDir, slide.out);
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`  ${slide.out} ← ${slide.src}`);
  }

  await browser.close();
  console.log('\nDone — iphone67 marketing screenshots at 1290×2796');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
