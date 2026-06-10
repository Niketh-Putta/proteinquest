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
const APP_URL = process.env.APP_URL ?? 'https://proteinquest.vercel.app';
const MOCK_SCAN = process.env.MOCK_SCAN !== '0';
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS ?? 45);
const VIEWPORT = { width: 390, height: 844 };
const MEAL_IMAGE = path.join(__dirname, 'meal-scan.jpg');
const OUTPUT = path.join(__dirname, 'proteinquest-demo.webm');
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

async function waitForToday(page) {
  await page.getByText('PROTEIN TODAY').waitFor({ timeout: 60_000 });
}

async function uploadAndLogMeal(page) {
  await page.goto(`${APP_URL}/scan`, { waitUntil: 'domcontentloaded' });
  await wait(2000);

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20_000 }),
    page.getByRole('button', { name: 'Upload from library' }).click(),
  ]);
  await chooser.setFiles(ensureMealImage());

  await page.getByText('TOTAL PROTEIN').waitFor({ timeout: MOCK_SCAN ? 15_000 : 120_000 });
  await wait(3800);

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
  await wait(1500);
}

async function showTrends(page) {
  await page.getByText('Trends', { exact: true }).click();
  await page.getByText('Rhythm').waitFor({ timeout: 15_000 });
  await page.getByText('Daily intake').waitFor({ timeout: 10_000 });
  await wait(8000);
}

function finalizeVideo(rawPath) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  let duration = 0;
  try {
    duration = Number(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${rawPath}"`, {
        encoding: 'utf8',
      }).trim(),
    );
  } catch {
    fs.copyFileSync(rawPath, OUTPUT);
    return { output: OUTPUT, duration: 0, trimmed: false };
  }

  if (duration <= TARGET_SECONDS + 3) {
    fs.copyFileSync(rawPath, OUTPUT);
    return { output: OUTPUT, duration, trimmed: false };
  }

  const trimmed = path.join(__dirname, 'proteinquest-demo-trimmed.webm');
  execSync(
    `ffmpeg -y -i "${rawPath}" -t ${TARGET_SECONDS} -c:v libvpx-vp9 -crf 32 -b:v 0 -an "${trimmed}"`,
    { stdio: 'inherit' },
  );
  fs.copyFileSync(trimmed, OUTPUT);
  fs.unlinkSync(trimmed);

  const finalDuration = Number(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUTPUT}"`, {
      encoding: 'utf8',
    }).trim(),
  );

  return { output: OUTPUT, duration: finalDuration, trimmed: true };
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

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  permissions: ['camera'],
});

const page = await context.newPage();
page.on('pageerror', (e) => console.warn('page error:', e.message));

await setupMockScan(page);
await injectSession(page, session);

try {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await wait(2500);
  await waitForToday(page);
  await wait(6500);

  await uploadAndLogMeal(page);
  await wait(1200);
  await waitForEvolution(page);
  await dismissCelebration(page);

  await page.goto(`${APP_URL}/today`, { waitUntil: 'domcontentloaded' });
  await wait(3500);

  await showTrends(page);
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

console.log('VIDEO:', result.output);
console.log('Duration:', result.duration.toFixed(1), 's', result.trimmed ? '(trimmed)' : '');
