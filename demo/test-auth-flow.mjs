// Test Cal AI / Locked auth + intro flow on live site.
// Run: node demo/test-auth-flow.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'https://proteinquest.vercel.app';
const OUT = path.resolve('demo');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('✓', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('✗', name, '-', e.message);
  }
}

console.log('Testing', BASE);

await check('welcome screen loads for fresh user', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Continue with Google').waitFor({ timeout: 15000 });
  await page.getByText('Continue as guest').waitFor();
  await page.screenshot({ path: path.join(OUT, 'flow-welcome.png') });
});

await check('guest path reaches intro walkthrough', async () => {
  await page.getByText('Continue as guest').click();
  await page.waitForTimeout(3000);
  await page.getByText('One number to hit every day').waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, 'flow-intro-1.png') });
});

await check('intro advances through screens', async () => {
  await page.getByText('Next').click();
  await page.waitForTimeout(800);
  await page.getByText('Snap food. AI counts protein.').waitFor({ timeout: 10000 });
  await page.getByText('Next').click();
  await page.waitForTimeout(800);
  await page.getByText('Feed your dragon with protein').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'flow-intro-3.png') });
});

await check('google button visible on welcome (fresh context)', async () => {
  const fresh = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const p = await fresh.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const google = p.getByText('Continue with Google');
  await google.waitFor({ timeout: 15000 });
  const clickable = await google.evaluate((el) => el.closest('button, [role=button]') !== null);
  if (!clickable) throw new Error('Google CTA not clickable');
  await fresh.close();
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log('\n--- Summary ---');
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('Failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
