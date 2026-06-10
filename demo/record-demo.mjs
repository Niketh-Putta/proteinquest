// Mobile demo: dragon pick → goal → scan → log → celebration
// APP_URL=https://proteinlens.vercel.app node demo/record-demo.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'https://proteinlens.vercel.app';
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

async function shot(name) {
  await page.screenshot({ path: path.join(__dirname, `step-${name}.png`) });
  console.log('step:', name);
}

try {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(3000);

  if (await page.getByText('CHOOSE YOUR DRAGON').isVisible().catch(() => false)) {
    await shot('01-dragon-pick');
    await page.getByText('Frost').click();
    await page.getByText('Continue').click();
    await page.waitForTimeout(800);
    await shot('02-goal-setup');
    await page.locator('input').nth(0).fill('26');
    await page.locator('input').nth(1).fill('70');
    await page.getByText('Female', { exact: true }).click();
    await page.getByText('Moderate', { exact: false }).first().click();
    await page.getByText('Build muscle', { exact: false }).first().click();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1000);
    await shot('03-goal-calculated');
    await page.getByText('Start tracking').click();
    await page.waitForTimeout(3000);
  }

  await page.getByText('PROTEIN TODAY').waitFor({ timeout: 60_000 });
  await shot('04-home-dragon');
  await page.waitForTimeout(1500);

  await page.goto(`${APP_URL}/scan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await shot('05-scan-camera');
  await page.locator('div[tabindex="0"]').filter({ hasNot: page.locator('svg') }).last().click();
  await page.waitForTimeout(6000);

  const hasResult = await page.getByText('TOTAL PROTEIN').isVisible().catch(() => false);
  const hasBilling = await page.getByText(/AI service unavailable/i).isVisible().catch(() => false);
  if (hasResult) {
    await shot('06-analysis');
    await page.getByText('Log it').click();
    await page.waitForTimeout(3000);
    await shot('07-logged');
  } else {
    await shot('06-scan-status');
    console.log('Analysis blocked:', hasBilling ? 'billing' : 'unknown');
  }

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.getByText('Trends', { exact: true }).click();
  await page.waitForTimeout(2000);
  await shot('08-trends');
} catch (e) {
  console.error('Demo error:', e.message);
  await shot('error');
} finally {
  await context.close();
  await browser.close();
}

const rawDir = path.join(__dirname, 'video-raw');
if (fs.existsSync(rawDir)) {
  const videos = fs.readdirSync(rawDir).filter((f) => f.endsWith('.webm'));
  if (videos.length) {
    fs.copyFileSync(path.join(rawDir, videos.at(-1)), path.join(__dirname, 'proteinlens-demo.webm'));
    console.log('VIDEO: demo/proteinlens-demo.webm');
  }
}
