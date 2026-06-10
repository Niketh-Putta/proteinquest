// E2E intro Get started with stale JWT in localStorage
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://proteinquest.vercel.app';
const stale = JSON.parse(readFileSync('/tmp/pq-stale-test.json', 'utf8'));
const STORAGE_KEY = 'sb-csxdkvpvcasuknhnprxp-auth-token';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(
  ({ key, session }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(session));
  },
  { key: STORAGE_KEY, session: stale.session },
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// Advance through intro
for (let i = 0; i < 4; i++) {
  const next = page.getByText(i === 3 ? 'Get started' : 'Next');
  await next.click({ timeout: 15000 });
  await page.waitForTimeout(800);
}

await page.waitForTimeout(3000);
const body = await page.locator('body').innerText();
const hasError = /Could not save|session expired/i.test(body);
const onOnboarding = /Choose|dragon|goal/i.test(body);
console.log('Has save error:', hasError);
console.log('On onboarding:', onOnboarding);
if (hasError) {
  const errLine = body.split('\n').find((l) => /Could not save|session expired/i.test(l));
  console.log('Error line:', errLine);
}
await page.screenshot({ path: 'demo/intro-stale-jwt-test.png', fullPage: true });
await browser.close();
process.exit(hasError ? 1 : 0);
