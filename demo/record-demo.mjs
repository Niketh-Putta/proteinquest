// ProteinQuest ~45s demo: intro → onboarding → scan → evolution → trends
// node demo/record-demo.mjs
// APP_URL=https://proteinquest.vercel.app MOCK_SCAN=1 node demo/record-demo.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { mockAnalysis, STORAGE_KEY, upgradeDemoUserForRecording } from './seed-demo-user.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'http://localhost:8081';
const MOCK_SCAN = process.env.MOCK_SCAN !== '0';
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS ?? 45);
const EVOLUTION_POST_SPEED = Number(process.env.EVOLUTION_POST_SPEED ?? 1);
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

async function setupDemoInit(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('pq_demo_auto_scan', '1');
  });
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

async function readSession(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

async function playIntro(page) {
  await page.getByText('Snap meals, get protein').waitFor({ timeout: 60_000 });
  await wait(700);

  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const isLast = i === steps - 1;
    const label = isLast ? 'Get started' : 'Next';
    const btn = page.getByText(label, { exact: true });
    await btn.waitFor({ timeout: 15_000 });
    await btn.click();
    await wait(isLast ? 900 : 680);
  }

  await page.getByText('Who will you grow with?').waitFor({ timeout: 20_000 });
  await wait(400);
}

async function playOnboarding(page) {
  const ember = page.getByText('Ember', { exact: true }).first();
  await ember.waitFor({ timeout: 10_000 });
  await ember.click();
  await wait(350);
  await page.getByText('Continue', { exact: true }).click();
  await wait(450);

  await page.getByText('Set your protein goal').waitFor({ timeout: 10_000 });
  const inputs = page.locator('input');
  await inputs.nth(0).fill('28');
  await inputs.nth(1).fill('72');
  await wait(200);
  await page.getByText('Male', { exact: true }).click();
  await page.getByText('Strength training', { exact: false }).first().click();
  await page.getByText('Build muscle', { exact: false }).first().click();
  await wait(500);
  await page.getByText('Start tracking').click();
  await wait(900);
}

async function playDailyDragon(page) {
  await page.getByText('Who are you growing today?').waitFor({ timeout: 15_000 });
  await wait(400);
  const ember = page.getByText('Ember', { exact: true }).first();
  await ember.click();
  await wait(300);
  await page.getByText('Lock in for today', { exact: true }).click();
  await wait(700);
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
  await wait(1800);

  await page.getByText('Log it', { exact: true }).click();
}

async function waitForEvolution(page) {
  await page.getByText(/EVOLVING|Watch your dragon transform/i).first().waitFor({ timeout: 20_000 });
  // Morph completes at MORPH_MS (2.1s) + brief reveal copy
  await wait(3800);
}

async function dismissCelebration(page) {
  const dismiss = page.getByText(/tap to continue/i);
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  } else {
    await page.locator('body').click({ position: { x: 195, y: 420 } });
  }
  await wait(600);
}

async function showTrends(page) {
  await page.getByText('Trends', { exact: true }).click();
  await page.getByText('Rhythm').waitFor({ timeout: 15_000 });
  await page.getByText('Daily intake').waitFor({ timeout: 10_000 });
  await wait(7500);
}

function ensureDemoMusic(durationSec) {
  if (fs.existsSync(MUSIC_FILE)) return MUSIC_FILE;

  const dur = Math.ceil(durationSec + 8);
  const filter = [
    `sine=frequency=196:duration=${dur}:sample_rate=44100`,
    `sine=frequency=246.94:duration=${dur}:sample_rate=44100`,
    `sine=frequency=293.66:duration=${dur}:sample_rate=44100`,
    `sine=frequency=392:duration=${dur}:sample_rate=44100`,
  ]
    .map((src) => `-f lavfi -i "${src}"`)
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

  let finalDuration = getDuration(trimmedPath);
  const music = ensureDemoMusic(finalDuration);

  let videoFilter = 'copy';
  if (EVOLUTION_POST_SPEED > 1 && EVOLUTION_POST_SPEED <= 1.2) {
    videoFilter = `setpts=PTS/${EVOLUTION_POST_SPEED}`;
  }

  execSync(
    `ffmpeg -y -i "${trimmedPath}" -i "${music}" -filter_complex "[1:a]volume=0.22,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, finalDuration - 3)}:d=3[a]" -map 0:v -map "[a]" -c:v ${videoFilter === 'copy' ? 'copy' : 'libvpx-vp9'} ${videoFilter === 'copy' ? '' : `-vf "${videoFilter}" -crf 32 -b:v 0`} -c:a libopus -b:a 96k -shortest "${OUTPUT_WEBM}"`,
    { stdio: 'inherit' },
  );

  execSync(
    `ffmpeg -y -i "${OUTPUT_WEBM}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${OUTPUT_MP4}"`,
    { stdio: 'inherit' },
  );

  if (trimmedPath !== rawPath && fs.existsSync(trimmedPath)) {
    fs.unlinkSync(trimmedPath);
  }

  finalDuration = getDuration(OUTPUT_WEBM);
  return {
    webm: OUTPUT_WEBM,
    mp4: OUTPUT_MP4,
    duration: finalDuration,
    trimmed: duration > TARGET_SECONDS + 3,
  };
}

console.log('Recording fresh-user demo against', APP_URL, MOCK_SCAN ? '(mock scan)' : '(live AI)');

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

await setupDemoInit(page);
await setupMockScan(page);

try {
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(1200);

  await playIntro(page);
  await playOnboarding(page);
  await playDailyDragon(page);
  await waitForToday(page);
  await wait(2000);

  const session = await readSession(page);
  if (!session?.user?.id) throw new Error('No auth session after onboarding');
  console.log('Upgrading demo user for evolution + trends…');
  await upgradeDemoUserForRecording(session, 'fire');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForToday(page);
  await wait(1200);

  await uploadAndLogMeal(page);
  await wait(300);
  await waitForEvolution(page);
  await dismissCelebration(page);

  await showTrends(page);
  await wait(4500);
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
