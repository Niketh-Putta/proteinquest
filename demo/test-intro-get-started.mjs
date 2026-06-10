// E2E: intro Get started save on production
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'https://proteinquest.vercel.app';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await ctx.newPage();
page.on('console', (m) => console.log('CONSOLE:', m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// Wait for intro or onboarding
const introTitle = page.getByText('Snap meals, get protein');
const onboarding = page.getByText('Choose your dragon', { exact: false });

if (await introTitle.isVisible({ timeout: 15000 }).catch(() => false)) {
  console.log('On intro step 1');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(600);
  }
  console.log('On last intro step, clicking Get started');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForTimeout(3000);

  const err = page.getByText('Could not save');
  const onboardingVisible = await page.getByText('Choose', { exact: false }).first().isVisible().catch(() => false);
  const errVisible = await err.isVisible().catch(() => false);
  const errText = errVisible ? await err.textContent() : null;

  console.log('Error visible:', errVisible, errText);
  console.log('Onboarding visible:', onboardingVisible);
  await page.screenshot({ path: 'demo/intro-save-test.png', fullPage: true });
} else {
  console.log('Not on intro - capturing state');
  await page.screenshot({ path: 'demo/intro-save-test.png', fullPage: true });
}

await browser.close();
