// Verify Trends tab on live deployment.
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'https://proteinquest.vercel.app';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

// Skip onboarding if needed
if (await page.getByText('CHOOSE YOUR DRAGON').isVisible().catch(() => false)) {
  await page.getByText('Ember').first().click();
  await page.getByText('Continue').click();
  await page.waitForTimeout(400);
  const inputs = page.locator('input');
  if ((await inputs.count()) >= 2) {
    await inputs.nth(0).fill('28');
    await inputs.nth(1).fill('80');
  }
  await page.getByText('Start tracking').click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

await page.goto(`${APP}/trends`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const hasRhythm = await page.getByText('Rhythm').isVisible();
const hasDailyIntake = await page.getByText('Daily intake').isVisible();
const hasAvgCopy =
  (await page.getByText(/logged day|log a meal/i).isVisible()) ||
  (await page.getByText(/days logged/i).isVisible());

console.log('Rhythm title:', hasRhythm);
console.log('Daily intake:', hasDailyIntake);
console.log('Average label:', hasAvgCopy);

await page.screenshot({ path: 'demo/trends-live.png' });
await browser.close();

if (!hasRhythm || !hasDailyIntake) process.exit(1);
console.log('TRENDS OK');
