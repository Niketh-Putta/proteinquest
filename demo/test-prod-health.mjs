// Quick production health check for proteinquest.vercel.app
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'https://proteinquest.vercel.app';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

const checks = [];

try {
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 45000 });
  checks.push({ name: 'home-loads', ok: true });

  const title = await page.title();
  checks.push({ name: 'has-title', ok: title.length > 0, title });

  // Intro or today should render
  const bodyText = await page.locator('body').innerText();
  const onIntro = /protein|dragon|get started|today|goal/i.test(bodyText);
  checks.push({ name: 'content-visible', ok: onIntro });

  await page.goto(`${APP}/admin`, { waitUntil: 'networkidle', timeout: 30000 });
  const adminText = await page.locator('body').innerText();
  checks.push({
    name: 'admin-loads',
    ok: /admin|password|sign in|stats/i.test(adminText),
  });
} catch (e) {
  checks.push({ name: 'fatal', ok: false, error: e.message });
}

await browser.close();

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ app: APP, checks, errors: errors.slice(0, 10) }, null, 2));
process.exit(failed.length > 0 || errors.length > 5 ? 1 : 0);
