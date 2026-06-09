// Records a walkthrough video of ProteinLens running on Expo web.
// Usage: node demo/record-demo.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'http://localhost:8081';
const VIEWPORT = { width: 390, height: 844 }; // iPhone-sized portrait

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: path.join(__dirname, 'video-raw'), size: VIEWPORT },
});
const page = await context.newPage();

page.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function pause(ms) {
  await page.waitForTimeout(ms);
}

async function shot(name) {
  await page.screenshot({ path: path.join(__dirname, `step-${name}.png`) });
  console.log(`step: ${name}`);
}

try {
  console.log('Loading app (first bundle can be slow)...');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  // ---- Onboarding ----
  await page.getByText("Let's set your", { exact: false }).waitFor({ timeout: 180_000 });
  await shot('01-onboarding');
  await pause(1500);

  await page.getByPlaceholder('25').fill('24');
  await pause(400);
  await page.getByPlaceholder('75').fill('78');
  await pause(400);
  await page.getByText('Male', { exact: true }).click();
  await pause(600);
  await page.getByText('Active', { exact: true }).click();
  await pause(600);
  await page.getByText('Build muscle', { exact: true }).click();
  await pause(800);

  // Scroll to reveal the computed goal + CTA
  await page.mouse.wheel(0, 1200);
  await pause(1500);
  await shot('02-goal-computed');

  await page.getByText('Start tracking', { exact: true }).click();

  // ---- Today dashboard (empty) ----
  await page.getByText("Today's protein", { exact: false }).waitFor({ timeout: 60_000 });
  await pause(2000);
  await shot('03-dashboard-empty');

  // ---- Snap flow ----
  await page.getByText('Snap meal', { exact: true }).click();
  await page.getByText('What are you eating?', { exact: false }).waitFor({ timeout: 30_000 });
  await pause(1200);
  await shot('04-snap');

  const mealPath = path.join(__dirname, 'demo-meal.jpg');
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 30_000 });
  await page.getByText('Choose from library', { exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(mealPath);

  console.log('Waiting for AI analysis...');
  await page.getByText('Total protein', { exact: false }).waitFor({ timeout: 120_000 });
  await pause(1500);
  await shot('05-analysis');
  await page.mouse.wheel(0, 900);
  await pause(2000);

  await page.getByText('Log it', { exact: true }).click();

  // ---- Dashboard with progress ----
  await page.getByText("Today's protein", { exact: false }).waitFor({ timeout: 60_000 });
  await pause(2500);
  await shot('06-dashboard-logged');

  // ---- Trends ----
  await page.getByText('Trends', { exact: true }).click();
  await page.getByText('Last 7 days', { exact: false }).waitFor({ timeout: 30_000 });
  await pause(2500);
  await shot('07-trends');

  // ---- Goal tab ----
  await page.getByText('Goal', { exact: true }).first().click();
  await page.getByText('Current daily target', { exact: false }).waitFor({ timeout: 30_000 });
  await pause(2500);
  await shot('08-goal');

  // ---- Back to Today for the closing shot ----
  await page.getByText('Today', { exact: true }).first().click();
  await pause(2500);

  console.log('Walkthrough complete.');
} catch (err) {
  await shot('ZZ-failure');
  console.error('DEMO FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await context.close(); // flushes the video
  const video = await page.video()?.path();
  await browser.close();
  if (video && fs.existsSync(video)) {
    const dest = path.join(__dirname, 'proteinlens-demo.webm');
    fs.copyFileSync(video, dest);
    fs.rmSync(path.dirname(video), { recursive: true, force: true });
    console.log('VIDEO SAVED:', dest);
  }
}
