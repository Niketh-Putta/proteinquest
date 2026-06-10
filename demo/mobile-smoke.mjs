// Mobile viewport smoke: dragon onboarding, scan error message, calculator.
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://proteinlens.vercel.app';
const OUT = path.resolve('demo/mobile');
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-14', width: 390, height: 844 },
  { name: 'iphone-14-pro-max', width: 428, height: 926 },
];

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

const results = [];

for (const vp of viewports) {
  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
  const ctx = await browser.newContext({ viewport: vp, permissions: ['camera'] });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3000);

  // Dragon selection onboarding
  const hasDragon = await page.getByText('CHOOSE YOUR DRAGON').isVisible().catch(() => false);
  if (hasDragon) {
    await page.getByText('Ember').click();
    await page.getByText('Continue').click();
    await page.waitForTimeout(800);
    await page.locator('input').nth(0).fill('28');
    await page.locator('input').nth(1).fill('175');
    await page.getByText('Male', { exact: true }).click();
    await page.getByText('Strength training', { exact: false }).first().click();
    await page.getByText('Build muscle', { exact: false }).first().click();
    await page.mouse.wheel(0, 600);
    const goalVisible = await page.getByText('g per kg bodyweight').isVisible().catch(() => false);
    console.log('  calculator:', goalVisible ? 'OK' : 'FAIL');
    await page.getByText('Start tracking').click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: path.join(OUT, `${vp.name}-today.png`) });

  // Check no horizontal scroll
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  const noHScroll = scrollW <= clientW + 2;
  console.log('  no horizontal scroll:', noHScroll ? 'OK' : `FAIL (${scrollW} > ${clientW})`);

  // Scan + expect clear billing error (not generic connection)
  await page.goto(`${BASE}/scan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.locator('div[tabindex="0"]').filter({ hasNot: page.locator('svg') }).last().click();
  await page.waitForTimeout(8000);

  const errorText = await page.locator('text=/AI service unavailable|billing|OpenAI/i').first().textContent().catch(() => null);
  const genericBad = await page.getByText('check your connection', { exact: false }).isVisible().catch(() => false);
  const scanMsg = errorText && !genericBad ? 'CLEAR_BILLING_MSG' : genericBad ? 'GENERIC_BAD' : 'NO_ERROR_SHOWN';
  console.log('  scan error message:', scanMsg, errorText?.slice(0, 60) ?? '');

  await page.screenshot({ path: path.join(OUT, `${vp.name}-scan-error.png`) });
  results.push({ viewport: vp.name, noHScroll, scanMsg, goalCalc: hasDragon });

  await ctx.close();
}

await browser.close();
console.log('\nRESULTS:', JSON.stringify(results, null, 2));
