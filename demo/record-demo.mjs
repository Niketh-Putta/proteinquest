// ProteinQuest product demo (~60–90s): intro → onboarding → daily pick → scan → celebration → end card
// APP_URL=https://proteinquest.vercel.app node demo/record-demo.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'https://proteinquest.vercel.app';
const VIEWPORT = { width: 390, height: 844 };
const PAUSE = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: path.join(__dirname, 'video-raw'), size: VIEWPORT },
  permissions: ['camera'],
});
const page = await context.newPage();
page.on('pageerror', (e) => console.warn('page error:', e.message));

async function shot(name) {
  await page.screenshot({ path: path.join(__dirname, `step-${name}.png`) });
  console.log('step:', name);
}

async function skipIntroIfNeeded() {
  const skip = page.getByText('Skip intro');
  if (await skip.isVisible({ timeout: 4000 }).catch(() => false)) {
    await shot('00-intro');
    await skip.click();
    await PAUSE(1200);
    return true;
  }
  const next = page.getByText('Next');
  if (await next.isVisible({ timeout: 2000 }).catch(() => false)) {
    await shot('00-intro');
    for (let i = 0; i < 3; i++) {
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await PAUSE(600);
    }
    const start = page.getByText('Get started');
    if (await start.isVisible().catch(() => false)) await start.click();
    await PAUSE(1200);
    return true;
  }
  return false;
}

async function runOnboarding() {
  const dragonPick = page.getByText('Who will you grow with?');
  if (!(await dragonPick.isVisible({ timeout: 15000 }).catch(() => false))) return false;

  await shot('01-dragon-pick');
  await page.getByText('Ember', { exact: true }).click();
  await PAUSE(500);
  await page.getByText('Continue').click();
  await PAUSE(1000);
  await shot('02-goal-setup');

  await page.locator('input').nth(0).fill('28');
  await page.locator('input').nth(1).fill('72');
  await page.getByText('Female', { exact: true }).click();
  await page.getByText('Moderate', { exact: false }).first().click();
  await page.getByText('Build muscle', { exact: false }).first().click();
  await page.mouse.wheel(0, 700);
  await PAUSE(1200);
  await shot('03-goal-calculated');
  await page.getByText('Start tracking').click();
  await PAUSE(2500);
  return true;
}

async function dailyDragonPick() {
  const picker = page.getByText('Who are you growing today?');
  if (await picker.isVisible({ timeout: 8000 }).catch(() => false)) {
    await shot('04-daily-dragon-pick');
    await page.getByText('Frost', { exact: true }).click();
    await PAUSE(600);
    await page.getByText('Lock in for today').click();
    await PAUSE(2000);
    return true;
  }
  return false;
}

async function waitForToday() {
  await dailyDragonPick();
  const today = page.getByText('PROTEIN TODAY');
  const daily = page.getByText('Who are you growing today?');
  await Promise.race([
    today.waitFor({ timeout: 60_000 }),
    daily.waitFor({ timeout: 60_000 }).then(() => dailyDragonPick()),
  ]);
  if (await daily.isVisible().catch(() => false)) await dailyDragonPick();
  await today.waitFor({ timeout: 30_000 });
  await shot('05-today-home');
  await PAUSE(3500);
}

async function scanMeal() {
  await page.goto(`${APP_URL}/scan`, { waitUntil: 'domcontentloaded' });
  await PAUSE(4000);
  await shot('06-scan-camera');

  const shutter = page.locator('div[tabindex="0"]').filter({ hasNot: page.locator('svg') }).last();
  if (await shutter.isVisible().catch(() => false)) {
    await shutter.click();
    await PAUSE(7000);
  }

  const hasResult = await page.getByText('TOTAL PROTEIN').isVisible().catch(() => false);
  if (hasResult) {
    await shot('07-analysis');
    await page.getByText('Log it').click();
    await PAUSE(4500);
    const evolved = await page.getByText(/EVOLVING|EVOLVED|Level up|You showed up/i).isVisible().catch(() => false);
    if (evolved) {
      await shot('08-celebration');
      await PAUSE(3500);
      await page.locator('body').click({ position: { x: 195, y: 500 } }).catch(() => {});
      await PAUSE(1500);
    } else {
      await shot('08-logged');
    }
    return true;
  }

  await shot('07-scan-status');
  console.log('Scan analysis unavailable — showing camera + today flow only');
  return false;
}

async function showEndCard() {
  const endCard = path.join(__dirname, 'end-card.html');
  await page.goto(`file://${endCard}`, { waitUntil: 'domcontentloaded' });
  await PAUSE(2500);
  await shot('09-end-card');
}

try {
  console.log('Recording demo against', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 180_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await PAUSE(4000);

  await skipIntroIfNeeded();
  await runOnboarding();
  await waitForToday();
  await scanMeal();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await PAUSE(2500);
  await shot('10-today-after');
  await PAUSE(2000);

  await page.getByText('Trends', { exact: true }).click();
  await PAUSE(3000);
  await shot('11-trends');

  await showEndCard();
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
    const dest = path.join(__dirname, 'proteinquest-demo.webm');
    fs.copyFileSync(path.join(rawDir, videos.at(-1)), dest);
    console.log('VIDEO:', dest);
  }
}
