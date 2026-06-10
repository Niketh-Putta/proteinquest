// Reproduce: "Take a photo" -> select file -> nothing happens (live web).
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'https://proteinlens.vercel.app';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

// Fresh anon user -> onboarding
await page.getByText("Let's set your", { exact: false }).waitFor({ timeout: 120_000 });
await page.getByPlaceholder('25').fill('30');
await page.getByPlaceholder('75').fill('80');
await page.getByText('Male', { exact: true }).click();
await page.getByText('Moderate', { exact: true }).click();
await page.getByText('Maintain', { exact: true }).click();
await page.getByText('Start tracking', { exact: true }).click();
await page.getByText("Today's protein", { exact: false }).waitFor({ timeout: 60_000 });
await page.getByText('Snap meal', { exact: true }).click();
await page.getByText('What are you eating?', { exact: false }).waitFor({ timeout: 30_000 });

console.log('--- clicking "Take a photo" ---');
const chooserPromise = page
  .waitForEvent('filechooser', { timeout: 10_000 })
  .catch(() => null);
await page.getByText('Take a photo', { exact: true }).click();
const chooser = await chooserPromise;
console.log('filechooser fired:', !!chooser);
if (chooser) {
  await chooser.setFiles(path.join(__dirname, 'demo-meal.jpg'));
  console.log('file set, waiting to observe state...');
}

for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(5000);
  const analyzing = await page.getByText('Counting protein', { exact: false }).isVisible().catch(() => false);
  const result = await page.getByText('Total protein', { exact: false }).isVisible().catch(() => false);
  const pick = await page.getByText('What are you eating?', { exact: false }).isVisible().catch(() => false);
  console.log(`t+${(i + 1) * 5}s analyzing=${analyzing} result=${result} pickScreen=${pick}`);
  if (result) break;
}
await page.screenshot({ path: path.join(__dirname, 'repro-final.png') });
await browser.close();
