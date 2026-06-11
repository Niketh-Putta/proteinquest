#!/usr/bin/env node
/**
 * Google Play Store — validate assets, deploy web, submit AAB for review.
 *
 * Usage:
 *   npm run play-store:submit          # validate + deploy + submit (internal track)
 *   npm run play-store:submit -- --check-only
 *   npm run play-store:submit -- --track production
 *
 * Requires for submit:
 *   store/google-play-service-account.json  (Play Console → API access)
 *   store/proteinquest.aab  OR latest EAS build
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const LISTING = join(ROOT, 'store/play-store-listing.json');
const SUBS = join(ROOT, 'store/google-play-subscriptions.json');
const AAB = join(ROOT, 'store/proteinquest.aab');
const SERVICE_ACCOUNT = join(ROOT, 'store/google-play-service-account.json');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const trackArg = args.find((a) => a.startsWith('--track='));
const track = trackArg?.split('=')[1] ?? 'internal';

function run(cmd, { optional = false } = {}) {
  console.log(`\n> ${cmd}`);
  const result = spawnSync('/bin/bash', ['-lc', cmd], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0 && !optional) {
    console.error(`\n✗ failed: ${cmd}`);
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1);
    }
  }
}

function checkAsset(label, path, minBytes = 1000) {
  if (!existsSync(path)) {
    console.log(`○ ${label}: missing — ${path}`);
    return false;
  }
  const size = statSync(path).size;
  if (size < minBytes) {
    console.log(`○ ${label}: too small (${size} bytes) — ${path}`);
    return false;
  }
  console.log(`✓ ${label}: ${path} (${Math.round(size / 1024)} KB)`);
  return true;
}

function printListingCopy() {
  const listing = JSON.parse(readFileSync(LISTING, 'utf8'));
  console.log('\n── Store listing copy ──');
  console.log(`App name: ${listing.appName}`);
  console.log(`Package: ${listing.packageName}`);
  console.log(`Short: ${listing.shortDescription}`);
  console.log(`Privacy: ${listing.privacyPolicyUrl}`);
  console.log(`Contact: ${listing.contactEmail}`);
}

function printSubscriptions() {
  const subs = JSON.parse(readFileSync(SUBS, 'utf8'));
  console.log('\n── Play Console subscriptions (Monetize → Subscriptions) ──');
  for (const sub of subs.subscriptions) {
    const plan = sub.basePlans[0];
    console.log(`  ${sub.productId} / ${plan.basePlanId}: £${plan.price} (${plan.billingPeriod})`);
  }
  console.log(`\nTerms URL for review: ${subs.reviewNotes.termsUrl}`);
  console.log(`Privacy URL: ${subs.reviewNotes.privacyPolicyUrl}`);
}

function validateAssets() {
  console.log('\n══ Asset validation ══');
  let ok = true;
  ok = checkAsset('App icon 512', join(ROOT, 'store/icon-512.png')) && ok;
  ok = checkAsset('Feature graphic', join(ROOT, 'store/play-feature-graphic.png')) && ok;
  for (const shot of ['01-today', '02-trends', '03-intro', '04-paywall', '05-scan']) {
    ok = checkAsset(`Screenshot ${shot}`, join(ROOT, `store/screenshots/${shot}.png`)) && ok;
  }
  ok = checkAsset('AAB bundle', AAB, 1_000_000) && ok;
  return ok;
}

loadEnv();

console.log('ProteinQuest — Google Play submit');
console.log(new Date().toISOString());

const assetsOk = validateAssets();
printListingCopy();
printSubscriptions();

if (!assetsOk) {
  console.error('\n✗ Fix missing assets before submitting.');
  if (!checkOnly) process.exit(1);
}

if (checkOnly) {
  console.log('\n--check-only: stopping before deploy/submit.');
  process.exit(assetsOk ? 0 : 1);
}

run('npx tsc --noEmit');
run('npm run deploy:prod');
run('node demo/test-analyze.mjs', { optional: true });

if (!existsSync(SERVICE_ACCOUNT)) {
  console.log('\n══════════════════════════════════════════════════');
  console.log('Submit blocked: store/google-play-service-account.json missing');
  console.log('══════════════════════════════════════════════════');
  console.log(`
1. Play Console → Setup → API access → Link Google Cloud project
2. Create service account with "Release manager" or "Admin" role
3. Download JSON → save as store/google-play-service-account.json
4. Re-run: npm run play-store:submit

Manual upload meanwhile:
  • Play Console → Testing → Internal testing → Create release
  • Upload: store/proteinquest.aab
  • Store listing assets in store/screenshots/ + store/play-feature-graphic.png
  • Subscriptions: see store/google-play-subscriptions.json
  • Promote to Production when ready
`);
  process.exit(0);
}

console.log(`\n══ Submitting AAB to Play Console (${track} track) ══`);
run(
  `npx eas submit --platform android --profile production --path "${AAB}" --track ${track} --non-interactive`,
);

console.log('\n✓ Submitted. Next in Play Console:');
console.log('  1. Complete store listing (copy from store/play-store-listing.json)');
console.log('  2. Data safety + content rating questionnaires');
console.log('  3. Create subscriptions pro_weekly + pro_yearly');
console.log('  4. Link RevenueCat → rebuild AAB with RC keys → resubmit if needed');
console.log('  5. Promote internal → production → Send for review');
