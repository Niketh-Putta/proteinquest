import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'https://proteinquest.vercel.app';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

const text = await page.locator('body').innerText();
console.log('Page text snippet:', text.slice(0, 300).replace(/\n/g, ' | '));

for (let i = 0; i < 4; i++) {
  const label = i === 3 ? 'Get started' : 'Next';
  const btn = page.getByText(label, { exact: true });
  await btn.waitFor({ timeout: 20000 });
  await btn.click();
  await page.waitForTimeout(1000);
}

await page.waitForTimeout(4000);
const after = await page.locator('body').innerText();
const err = after.match(/Could not save[^\n]*/)?.[0];
console.log('After click error:', err ?? 'none');
console.log('Onboarding?', /Choose|dragon|weight|goal/i.test(after));
await page.screenshot({ path: 'demo/intro-fresh-test.png', fullPage: true });
await browser.close();
process.exit(err ? 1 : 0);
