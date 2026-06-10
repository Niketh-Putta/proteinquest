// Records a walkthrough video of ProteinLens on Expo web.
// Usage: APP_URL=https://proteinlens.vercel.app node demo/record-demo.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'http://localhost:8081';
const VIEWPORT = { width: 390, height: 844 };

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: path.join(__dirname, 'video-raw'), size: VIEWPORT },
  permissions: ['camera'],
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
  console.log('Loading', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 180_000 });

  await page.getByText('One number.', { exact: false }).waitFor({ timeout: 180_000 });
  await shot('01-onboarding');
  await pause(1200);

  await page.locator('input').nth(0).fill('28');
  await page.locator('input').nth(1).fill('178');
  await page.getByText('lbs', { exact: true }).click();
  await page.getByText('Male', { exact: true }).click();
  await page.getByText('Strength training', { exact: false }).first().click();
  await page.getByText('Build muscle', { exact: false }).first().click();
  await page.mouse.wheel(0, 900);
  await pause(1200);
  await shot('02-goal-computed');

  await page.getByText('Start tracking').click();
  await page.getByText('PROTEIN TODAY').waitFor({ timeout: 60_000 });
  await pause(2000);
  await shot('03-dashboard');

  await page.goto(`${APP_URL}/scan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await shot('04-scan-camera');

  // Shutter capture with fake camera stream
  await page.locator('div[tabindex="0"]').filter({ hasNot: page.locator('svg') }).last().click();

  console.log('Waiting for analysis...');
  try {
    await page.getByText('TOTAL PROTEIN').waitFor({ timeout: 90_000 });
    await pause(1500);
    await shot('05-analysis');
    await page.getByText('Log it').click();
    await pause(3000);
    await shot('06-logged');
  } catch {
    await shot('05-analysis-error');
    console.log('Analysis may have failed (check OpenAI billing). Continuing.');
  }

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.getByText('Trends', { exact: true }).click();
  await page.getByText('LAST 7 DAYS').waitFor({ timeout: 30_000 }).catch(() => {});
  await pause(2000);
  await shot('07-trends');
} catch (e) {
  console.error('Demo failed:', e.message);
  await shot('error');
} finally {
  await context.close();
  await browser.close();
}

const rawDir = path.join(__dirname, 'video-raw');
const videos = fs.readdirSync(rawDir).filter((f) => f.endsWith('.webm'));
if (videos.length) {
  const src = path.join(rawDir, videos.sort().at(-1));
  const dest = path.join(__dirname, 'proteinlens-demo.webm');
  fs.copyFileSync(src, dest);
  console.log('Raw video:', dest);
  console.log('Convert: ffmpeg -i demo/proteinlens-demo.webm -c:v libx264 demo/proteinlens-demo.mp4');
}
