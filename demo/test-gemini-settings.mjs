// Browser test: Settings AI Provider UI on mobile viewport.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'https://proteinquest.vercel.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(3000);

// Complete minimal onboarding if needed
if (await page.getByText('CHOOSE YOUR DRAGON').isVisible().catch(() => false)) {
  await page.getByText('Ember').click();
  await page.getByText('Continue').click();
  await page.locator('input').nth(0).fill('25');
  await page.locator('input').nth(1).fill('70');
  await page.getByText('Male', { exact: true }).click();
  await page.getByText('Sedentary').click();
  await page.getByText('Maintain').click();
  await page.getByText('Start tracking').click();
  await page.waitForTimeout(3000);
}

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const hasSection = await page.getByText('AI PROVIDER').isVisible();
console.log('AI PROVIDER section:', hasSection ? 'OK' : 'FAIL');

await page.getByText('My Gemini key').click();
await page.waitForTimeout(500);
const hasInput = await page.getByPlaceholder('AIza...').isVisible();
console.log('Gemini key input:', hasInput ? 'OK' : 'FAIL');
await page.getByPlaceholder('AIza...').fill('AIza-invalid-test-key');
await page.getByText(/Save key|Re-validate key/).click();
await page.waitForTimeout(5000);

const err = await page.getByText(/Invalid Gemini|apikey/i).isVisible().catch(() => false);
console.log('Invalid key error:', err ? 'OK' : 'FAIL');

await page.screenshot({ path: 'demo/gemini-settings.png' });
await browser.close();
console.log('Screenshot: demo/gemini-settings.png');
