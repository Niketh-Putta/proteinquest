// ProteinQuest ~45s demo: Today → scan meal → XP + evolution → Trends
// node demo/record-demo.mjs
// APP_URL=https://proteinquest.vercel.app MOCK_SCAN=1 node demo/record-demo.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { mockAnalysis, seedDemoUser, STORAGE_KEY } from './seed-demo-user.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local dev server includes pq_demo_auto_scan (no camera green screen). Override with APP_URL for prod after deploy.
const APP_URL = process.env.APP_URL ?? 'http://localhost:8081';
const MOCK_SCAN = process.env.MOCK_SCAN !== '0';
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS ?? 45);
const VIEWPORT = { width: 390, height: 844 };
const MEAL_IMAGE = path.join(__dirname, 'meal-scan.jpg');
const OUTPUT_WEBM = path.join(__dirname, 'proteinquest-demo.webm');
const OUTPUT_MP4 = path.join(__dirname, 'proteinquest-demo.mp4');
const MUSIC_FILE = path.join(__dirname, 'demo-music.mp3');
const RAW_DIR = path.join(__dirname, 'video-raw');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureMealImage() {
  if (fs.existsSync(MEAL_IMAGE)) return MEAL_IMAGE;
  const fallback = path.join(__dirname, 'demo-meal.jpg');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error('Missing demo/meal-scan.jpg — add a meal photo first.');
}

async function injectSession(page, session) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          access_token: value.access_token,
          refresh_token: value.refresh_token,
          expires_at: value.expires_at,
          expires_in: value.expires_in,
          token_type: value.token_type,
          user: value.user,
        }),
      );
      sessionStorage.setItem('pq_demo_auto_scan', '1');
    },
    { key: STORAGE_KEY, value: session },
  );
}

async function setupMockScan(page) {
  if (!MOCK_SCAN) return;
  await page.route('**/functions/v1/analyze-food', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ analysis: mockAnalysis() }),
    });
  });
}

async function fastSkipIntro(page) {
  if (await page.getByText('Skip intro').isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByText('Skip intro').click();
    await wait(300);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const next = page.getByRole('button', { name: 'Next' });
    if (!(await next.isVisible({ timeout: 400 }).catch(() => false))) break;
    await next.click();
    await wait(180);
  }
  const getStarted = page.getByRole('button', { name: 'Get started' });
  if (await getStarted.isVisible({ timeout: 400 }).catch(() => false)) {
    await getStarted.click();
    await wait(300);
  }
}

async function fastSkipOnboarding(page) {
  if (!(await page.getByText('How much protein per day?').isVisible({ timeout: 1200 }).catch(() => false))) {
    return;
  }
  const ember = page.getByText('Ember', { exact: true }).first();
  if (await ember.isVisible({ timeout: 400 }).catch(() => false)) {
    await ember.click();
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible({ timeout: 400 }).catch(() => false)) {
      await continueBtn.click();
      await wait(250);
    }
  }
  const inputs = page.locator('input');
  if ((await inputs.count()) >= 2) {
    await inputs.nth(0).fill('28');
    await inputs.nth(1).fill('72');
  }
  const male = page.getByText('Male', { exact: true });
  if (await male.isVisible({ timeout: 400 }).catch(() => false)) await male.click();
  const strength = page.getByText('Strength training', { exact: false }).first();
  if (await strength.isVisible({ timeout: 400 }).catch(() => false)) await strength.click();
  const buildMuscle = page.getByText('Build muscle', { exact: false }).first();
  if (await buildMuscle.isVisible({ timeout: 400 }).catch(() => false)) await buildMuscle.click();
  const start = page.getByText('Start tracking');
  if (await start.isVisible({ timeout: 400 }).catch(() => false)) {
    await start.click();
    await wait(800);
  }
}

async function fastPickDailyDragon(page) {
  if (!(await page.getByText('Who are you growing today?').isVisible({ timeout: 1200 }).catch(() => false))) {
    return;
  }
  const ember = page.getByText('Ember', { exact: true }).first();
  if (await ember.isVisible({ timeout: 600 }).catch(() => false)) await ember.click();
  const lock = page.getByRole('button', { name: 'Lock in for today' });
  if (await lock.isVisible({ timeout: 600 }).catch(() => false)) {
    await lock.click();
    await wait(600);
  }
}

async function waitForToday(page) {
  await page.getByText('PROTEIN TODAY').waitFor({ timeout: 60_000 });
}

async function uploadAndLogMeal(page) {
  await page.evaluate(() => sessionStorage.setItem('pq_demo_auto_scan', '1'));

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20_000 }),
    page.getByText('Scan', { exact: true }).click(),
  ]);
  await chooser.setFiles(ensureMealImage());

  await page.getByText('ANALYZING').waitFor({ timeout: 8_000 }).catch(() => {});
  await page.getByText('TOTAL PROTEIN').waitFor({ timeout: MOCK_SCAN ? 15_000 : 120_000 });
  await wait(2800);

  await page.getByText('Log it', { exact: true }).click();
}

async function waitForEvolution(page) {
  const evolved = page.getByText(/EVOLVED|evolved|Watch your dragon transform/i);
  await evolved.first().waitFor({ timeout: 20_000 });
  // Full morph: charge (~1.3s) + crossfade (~3.4s) + reveal copy
  await wait(11000);
}

async function dismissCelebration(page) {
  const dismiss = page.getByText(/tap to continue/i);
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  } else {
    await page.locator('body').click({ position: { x: 195, y: 420 } });
  }
  await wait(1000);
}

async function showTrends(page) {
  await page.getByText('Trends', { exact: true }).click();
  await page.getByText('Rhythm').waitFor({ timeout: 15_000 });
  await page.getByText('Daily intake').waitFor({ timeout: 10_000 });
  await wait(6500);
}

function ensureDemoMusic(durationSec) {
  if (fs.existsSync(MUSIC_FILE)) return MUSIC_FILE;

  const dur = Math.ceil(durationSec + 8);
  // Royalty-free: soft ambient pad generated locally (no external copyright)
  const filter = [
    `sine=frequency=196:duration=${dur}:sample_rate=44100`,
    `sine=frequency=246.94:duration=${dur}:sample_rate=44100`,
    `sine=frequency=293.66:duration=${dur}:sample_rate=44100`,
    `sine=frequency=392:duration=${dur}:sample_rate=44100`,
  ]
    .map((src, i) => `-f lavfi -i "${src}"`)
    .join(' ');

  const mixInputs = '[0:a]volume=0.06[a0];[1:a]volume=0.05[a1];[2:a]volume=0.04[a2];[3:a]volume=0.03[a3]';
  const fadeOut = Math.max(0, dur - 4);
  const filterComplex = `${mixInputs};[a0][a1][a2][a3]amix=inputs=4:duration=longest,volume=0.9,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=4`;

  execSync(
    `ffmpeg -y ${filter} -filter_complex "${filterComplex}" -c:a libmp3lame -q:a 6 "${MUSIC_FILE}"`,
    { stdio: 'inherit' },
  );
  return MUSIC_FILE;
}

function getDuration(filePath) {
  try {
    return Number(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, {
        encoding: 'utf8',
      }).trim(),
    );
  } catch {
    return 0;
  }
}

function finalizeVideo(rawPath) {
  fs.mkdirSync(path.dirname(OUTPUT_WEBM), { recursive: true });

  const duration = getDuration(rawPath);
  let trimmedPath = rawPath;

  if (duration > TARGET_SECONDS + 3) {
    trimmedPath = path.join(__dirname, 'proteinquest-demo-trimmed.webm');
    execSync(
      `ffmpeg -y -i "${rawPath}" -t ${TARGET_SECONDS} -c:v libvpx-vp9 -crf 32 -b:v 0 -an "${trimmedPath}"`,
      { stdio: 'inherit' },
    );
  }

  const finalDuration = getDuration(trimmedPath);
  const music = ensureDemoMusic(finalDuration);

  execSync(
    `ffmpeg -y -i "${trimmedPath}" -i "${music}" -filter_complex "[1:a]volume=0.22,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, finalDuration - 3)}:d=3[a]" -map 0:v -map "[a]" -c:v copy -c:a libopus -b:a 96k -shortest "${OUTPUT_WEBM}"`,
    { stdio: 'inherit' },
  );

  execSync(
    `ffmpeg -y -i "${OUTPUT_WEBM}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${OUTPUT_MP4}"`,
    { stdio: 'inherit' },
  );

  if (trimmedPath !== rawPath && fs.existsSync(trimmedPath)) {
    fs.unlinkSync(trimmedPath);
  }

  const webmDuration = getDuration(OUTPUT_WEBM);
  return {
    webm: OUTPUT_WEBM,
    mp4: OUTPUT_MP4,
    duration: webmDuration,
    trimmed: duration > TARGET_SECONDS + 3,
  };
}

console.log('Seeding demo user…');
const { session } = await seedDemoUser();
console.log('Recording against', APP_URL, MOCK_SCAN ? '(mock scan)' : '(live AI)');

if (fs.existsSync(RAW_DIR)) {
  for (const f of fs.readdirSync(RAW_DIR)) {
    fs.unlinkSync(path.join(RAW_DIR, f));
  }
} else {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: RAW_DIR, size: VIEWPORT },
});

const page = await context.newPage();
page.on('pageerror', (e) => console.warn('page error:', e.message));

await setupMockScan(page);
await injectSession(page, session);

try {
  await page.goto(`${APP_URL}/today`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await wait(300);
  await fastSkipIntro(page);
  await fastSkipOnboarding(page);
  await fastPickDailyDragon(page);
  await waitForToday(page);
  await wait(2200);

  await uploadAndLogMeal(page);
  await wait(500);
  await waitForEvolution(page);
  await dismissCelebration(page);

  await page.goto(`${APP_URL}/today`, { waitUntil: 'domcontentloaded' });
  await wait(1800);

  await showTrends(page);
  // Hold on trends chart so final cut lands ~42–46s
  await wait(12000);
} catch (e) {
  console.error('Demo recording error:', e.message);
  await page.screenshot({ path: path.join(__dirname, 'record-error.png'), fullPage: true });
  throw e;
} finally {
  await context.close();
  await browser.close();
}

const rawVideos = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.webm'));
if (!rawVideos.length) {
  throw new Error('No Playwright video captured.');
}

const rawPath = path.join(RAW_DIR, rawVideos.at(-1));
const result = finalizeVideo(rawPath);

console.log('WEBM:', result.webm);
console.log('MP4:', result.mp4);
console.log('Duration:', result.duration.toFixed(1), 's', result.trimmed ? '(trimmed)' : '');
