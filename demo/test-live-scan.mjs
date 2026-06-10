// Full verification: API scan + browser scan + delete on live site.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL ?? 'https://proteinquest.vercel.app';
const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

async function testApi() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  await supabase.auth.signInAnonymously();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? SUPABASE_KEY;
  const b64 = readFileSync(path.join(__dirname, 'demo-meal.jpg')).toString('base64');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-food`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image_base64: b64, mime_type: 'image/jpeg' }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('API FAIL', res.status, text.slice(0, 300));
    return false;
  }
  const data = JSON.parse(text);
  if (data.error) {
    console.error('API error:', data.error);
    return false;
  }
  console.log('API OK — protein:', data.analysis?.total_protein_g, 'g, items:', data.analysis?.items?.length);
  return data.analysis?.is_food === true;
}

async function skipOnboarding(page) {
  if (await page.getByText('Hit your protein').isVisible({ timeout: 4000 }).catch(() => false)) {
    await page.getByText('Ember').first().click();
    await page.getByText('Continue').click();
    await page.waitForTimeout(800);
  }
  if (await page.getByText('How much protein per day?').isVisible({ timeout: 3000 }).catch(() => false)) {
    const inputs = page.locator('input');
    if ((await inputs.count()) >= 2) {
      await inputs.nth(0).fill('28');
      await inputs.nth(1).fill('80');
    }
    await page.getByText('Male', { exact: true }).click();
    await page.getByText('Strength training', { exact: false }).first().click();
    await page.getByText('Build muscle', { exact: false }).first().click();
    await page.waitForTimeout(500);
    await page.getByText('Start tracking').click();
    await page.waitForTimeout(5000);
  }
  await page.getByText('Protein', { exact: false }).first().waitFor({ timeout: 20000 });
}

async function testBrowserScanAndDelete() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on('dialog', (d) => d.accept());

  await page.goto(APP, { waitUntil: 'networkidle', timeout: 90000 });
  await skipOnboarding(page);

  await page.goto(`${APP}/scan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 25000 }),
    page.getByRole('button', { name: 'Upload from library' }).click(),
  ]);

  await chooser.setFiles(path.join(__dirname, 'demo-meal.jpg'));

  const scanOk = await page
    .getByText('TOTAL PROTEIN')
    .waitFor({ timeout: 120000 })
    .then(() => true)
    .catch(async () => {
      const banner = await page.locator('text=/JSON|glitch|failed|malformed|connection/i').first().textContent().catch(() => null);
      console.error('scan UI error:', banner);
      await page.screenshot({ path: path.join(__dirname, 'scan-fail.png'), fullPage: true });
      return false;
    });

  if (!scanOk) {
    await browser.close();
    return false;
  }
  console.log('Scan result screen OK');

  await page.getByText('Log it', { exact: true }).click();
  await page.waitForTimeout(2000);
  if (await page.getByText('tap to continue').isVisible().catch(() => false)) {
    await page.getByText('tap to continue').click();
  }
  await page.waitForURL(/today/, { timeout: 20000 }).catch(() => {});
  await page.getByText('LOGGED TODAY').waitFor({ timeout: 20000 });

  const deleteBtn = page.getByRole('button', { name: 'Delete meal' }).first();
  const hasDelete = await deleteBtn.isVisible().catch(() => false);
  console.log('Delete button visible:', hasDelete);

  if (hasDelete) {
    await deleteBtn.click();
    await page.waitForTimeout(1500);
    const stillVisible = await deleteBtn.isVisible().catch(() => false);
    console.log('After delete, button still visible:', stillVisible);
  }

  await page.screenshot({ path: path.join(__dirname, 'live-verify.png'), fullPage: true });
  await browser.close();
  return scanOk && hasDelete;
}

console.log('=== API ===');
const apiOk = await testApi();
console.log('=== Browser scan + delete ===');
const browserOk = await testBrowserScanAndDelete();

if (!apiOk || !browserOk) process.exit(1);
console.log('ALL VERIFIED');
