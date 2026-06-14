#!/usr/bin/env node
/**
 * iOS App Store ship — run the moment Apple Developer enrollment is Active.
 *
 * Usage:
 *   node scripts/ios-app-store-ship.mjs           # checklist only
 *   node scripts/ios-app-store-ship.mjs --build # build production IPA
 *   node scripts/ios-app-store-ship.mjs --submit  # submit latest build to ASC
 *
 * Prerequisites (manual, before --build):
 *   1. Apple Developer Program membership Active (not Pending)
 *   2. App Store Connect app created → copy numeric Apple ID into eas.json ascAppId
 *   3. eas.json: appleId, appleTeamId filled in
 *   4. App Store Connect → Subscriptions: pro_weekly + pro_yearly (group "ProteinQuest Pro")
 *   5. RevenueCat → iOS app + In-App Purchase P8 key → copy appl_ key to .env
 *   6. node scripts/sync-revenuecat-keys.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const doBuild = args.has('--build');
const doSubmit = args.has('--submit');

function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq);
      if (!process.env[k]) process.env[k] = t.slice(eq + 1);
    }
  }
}

function run(cmd, optional = false) {
  console.log(`\n> ${cmd}`);
  const r = spawnSync('/bin/bash', ['-lc', cmd], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0 && !optional) {
    console.error(`Failed: ${cmd}`);
    process.exit(r.status ?? 1);
  }
  return r.status === 0;
}

function check(label, pass, hint = '') {
  console.log(`${pass ? '✓' : '✗'} ${label}${pass ? '' : hint ? ` — ${hint}` : ''}`);
  return pass;
}

loadEnv();

console.log('ProteinQuest — iOS App Store ship checklist\n');

const easJson = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
const iosSubmit = easJson.submit?.production?.ios ?? {};
const listing = JSON.parse(readFileSync(join(ROOT, 'store/app-store-listing.json'), 'utf8'));

let ready = true;

ready = check('Typecheck passes', run('npx tsc --noEmit', true)) && ready;
ready = check('App icon is PNG 1024×1024', (() => {
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', join(ROOT, 'assets/images/icon.png')], { encoding: 'utf8' });
    return out.includes('1024') && out.includes('hasAlpha: no') && !execFileSync('file', ['-b', join(ROOT, 'assets/images/icon.png')], { encoding: 'utf8' }).includes('JPEG');
  } catch {
    return false;
  }
})()) && ready;

ready = check('iPhone screenshots (1290×2796)', existsSync(join(ROOT, 'store/screenshots/ios/iphone-6.9/01-today.png'))) && ready;
ready = check('iPad screenshots (2048×2732)', existsSync(join(ROOT, 'store/screenshots/ios/ipad-13/01-today.png'))) && ready;
ready = check('Listing metadata', !!listing.description && !!listing.privacyPolicyUrl) && ready;
ready = check('Paywall Terms + Privacy + Restore', (() => {
  const src = readFileSync(join(ROOT, 'src/app/paywall.tsx'), 'utf8');
  return src.includes('Terms of Use') && src.includes('Restore purchases') && src.includes('automatically renews');
})()) && ready;

ready = check('EXPO_TOKEN set', !!process.env.EXPO_TOKEN?.trim()) && ready;
ready = check('EXPO_PUBLIC_REVENUECAT_IOS_KEY (appl_…)', process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('appl_') ?? false, 'add after RevenueCat iOS app + rebuild') && ready;

ready = check('eas.json appleId', iosSubmit.appleId && !iosSubmit.appleId.includes('REPLACE')) && ready;
ready = check('eas.json ascAppId', iosSubmit.ascAppId && !String(iosSubmit.ascAppId).includes('REPLACE'), 'App Store Connect → App Information → Apple ID') && ready;
ready = check('eas.json appleTeamId', iosSubmit.appleTeamId && !iosSubmit.appleTeamId.includes('REPLACE'), 'developer.apple.com/account → Membership') && ready;

console.log(`
When enrollment is Active, run in order:

  1. App Store Connect → create app "ProteinQuest" (com.proteinquest.app)
  2. Monetization → Subscriptions → group "ProteinQuest Pro":
       pro_weekly £6.99/wk, pro_yearly £29.99/yr
  3. Users and Access → Integrations → In-App Purchase → generate P8 key
  4. RevenueCat → add iOS app, upload P8, copy appl_ key → .env
  5. node scripts/sync-revenuecat-keys.mjs
  6. node scripts/ios-app-store-ship.mjs --build
  7. Upload screenshots + listing from store/app-store-listing.json in ASC
  8. node scripts/ios-app-store-ship.mjs --submit
  9. TestFlight sandbox purchase → Submit for Review

Listing copy: store/app-store-listing.json
Review notes: ${listing.reviewNotes?.slice(0, 80)}…
`);

if (!ready && (doBuild || doSubmit)) {
  console.error('\nFix blockers above before --build or --submit.');
  process.exit(1);
}

if (doBuild) {
  run('EAS_BUILD_NO_EXPO_GO_WARNING=true npx eas-cli build --platform ios --profile production --non-interactive');
}

if (doSubmit) {
  run('npx eas-cli submit --platform ios --profile production --latest --non-interactive');
}

if (!doBuild && !doSubmit) {
  console.log(ready ? '\nAll automated checks passed. Waiting on Apple enrollment + ASC setup above.' : '\nSome checks failed — fix before building.');
  process.exit(ready ? 0 : 1);
}
