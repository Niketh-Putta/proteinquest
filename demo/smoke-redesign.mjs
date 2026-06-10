// Smoke test for the redesigned app: onboarding -> today -> scan (camera) -> result -> log.
// Run: node demo/smoke-redesign.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const OUT = path.resolve('demo/screens');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  permissions: ['camera'],
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 200));
});

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

console.log('1. open', BASE);
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(4000);
await shot('01-landing');

// Onboarding (fresh anon session every run)
if (await page.getByText('One number.').isVisible().catch(() => false)) {
  console.log('2. onboarding');
  const inputs = page.locator('input');
  await inputs.nth(0).fill('28');
  await inputs.nth(1).fill('178');
  await page.getByText('lbs', { exact: true }).click();
  await page.getByText('Male', { exact: true }).click();
  await page.getByText('Strength training', { exact: false }).first().click();
  await page.getByText('Build muscle', { exact: false }).first().click();
  await page.waitForTimeout(800);
  await shot('02-onboarding-goal');
  const target = await page.getByText('g per kg bodyweight').textContent().catch(() => null);
  console.log('   goal reasoning visible:', target);
  await page.getByText('Start tracking').click();
  await page.waitForTimeout(3500);
}

await shot('03-today');
console.log('3. today screen loaded');

// Open scan via center button (Ionicons scan icon) — click the accent circle
console.log('4. open scan');
await page.locator('div[tabindex="0"]').filter({ has: page.locator('svg') }).last().click().catch(() => {});
// More robust: navigate directly
await page.goto(`${BASE}/scan`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await shot('04-scan-camera');

const hasVideo = await page.locator('video').count();
console.log('   camera <video> elements:', hasVideo);

// Shutter: the large accent circle button
console.log('5. capture');
const shutter = page.locator('div[tabindex="0"]').filter({ hasNot: page.locator('svg') }).last();
await shutter.click();
await page.waitForTimeout(2500);
await shot('05-analyzing');

// Wait for result or error banner
const result = await Promise.race([
  page.getByText('TOTAL PROTEIN').waitFor({ timeout: 60000 }).then(() => 'result'),
  page.getByText('No food detected').waitFor({ timeout: 60000 }).then(() => 'nofood'),
]).catch(() => 'timeout');
console.log('6. analysis outcome:', result);
await shot('06-result');

if (result === 'result') {
  await page.getByText('Log it').click();
  await page.waitForTimeout(4000);
  await shot('07-after-log');
  console.log('7. logged. celebration/today visible.');
  // dismiss celebration if shown
  await page.mouse.click(215, 466);
  await page.waitForTimeout(2000);
  await shot('08-today-final');
}

await browser.close();
console.log('SMOKE DONE');
