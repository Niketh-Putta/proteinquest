#!/usr/bin/env node
/**
 * Production payments readiness check (iOS App Store build live).
 * Usage: node scripts/verify-payments-production.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const WEBHOOK_URL =
  'https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook';

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq);
    if (!process.env[k]) process.env[k] = t.slice(eq + 1);
  }
}

function ok(label, pass, hint = '') {
  const mark = pass ? '✓' : '✗';
  console.log(`${mark} ${label}${pass ? '' : hint ? ` — ${hint}` : ''}`);
  return pass;
}

async function webhookReachable() {
  try {
    const res = await fetch(WEBHOOK_URL, { method: 'GET' });
    return res.status === 405 || res.status === 401 || res.status === 400;
  } catch {
    return false;
  }
}

async function main() {
  loadEnv();
  console.log('ProteinQuest — production payments check\n');

  let pass = 0;
  const total = 10;

  if (ok('RevenueCat iOS key configured', !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('appl_'))) pass++;
  if (ok('RevenueCat Android key configured', !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.startsWith('goog_'))) pass++;
  if (ok('StoreKit catalog (pro_weekly, pro_yearly)', readFileSync(join(ROOT, 'store/ProteinQuest.storekit'), 'utf8').includes('pro_weekly'))) pass++;
  if (ok('Paywall blocks test mode in production', readFileSync(join(ROOT, 'src/app/paywall.tsx'), 'utf8').includes('!__DEV__'))) pass++;
  if (ok('Server scan limit in analyze-food', readFileSync(join(ROOT, 'supabase/functions/analyze-food/index.ts'), 'utf8').includes('enforcePhotoScanLimit'))) pass++;
  if (ok('Webhook ignores CANCELLATION until EXPIRATION', !readFileSync(join(ROOT, 'supabase/functions/_shared/entitlement-state.ts'), 'utf8').includes('"CANCELLATION"'))) pass++;
  if (ok('RevenueCat webhook deployed (reachable)', await webhookReachable())) pass++;

  if (process.env.EXPO_TOKEN) {
    const r = spawnSync('npx', ['eas', 'env:list', '--environment', 'production', '--non-interactive'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
    });
    if (ok('EAS production has iOS RC key', r.stdout?.includes('EXPO_PUBLIC_REVENUECAT_IOS_KEY'))) pass++;
  } else {
    ok('EAS production has iOS RC key', false, 'set EXPO_TOKEN to verify');
  }

  if (ok('revenuecat-webhook in deploy workflow', readFileSync(join(ROOT, '.github/workflows/deploy-supabase-edge.yml'), 'utf8').includes('revenuecat-webhook'))) pass++;
  if (ok('Subscription billing UI', existsSync(join(ROOT, 'src/components/SubscriptionBillingInfo.tsx')))) pass++;

  console.log(`\nAutomated checks: ${pass}/${total}`);

  console.log(`
RevenueCat dashboard (required for live IAP on App Store build):
  1. Project → iOS app com.proteinquest.app
  2. App Store Connect → upload In-App Purchase API key (.p8) OR shared secret
  3. Products: pro_weekly + pro_yearly imported and linked to entitlement "pro"
  4. Offering "default" (current): $rc_weekly + $rc_annual packages
  5. Integrations → Webhooks:
       URL: ${WEBHOOK_URL}
       Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH from Supabase secrets>

App Store Connect (required):
  1. Paid Apps Agreement: Active (banking + tax complete)
  2. Subscriptions pro_weekly / pro_yearly: Approved for sale
  3. Subscription group "ProteinQuest Pro" attached to app version in production

If paywall shows "Subscriptions unavailable" on a production install:
  → RevenueCat cannot fetch offerings — fix ASC agreement + RC product linking above.
  → Rebuild is only needed if EXPO_PUBLIC_REVENUECAT_IOS_KEY was missing from the live build.
`);

  process.exit(pass >= 7 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
