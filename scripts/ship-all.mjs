#!/usr/bin/env node
/**
 * End-to-end ship checklist for ProteinQuest.
 * Run on your Mac (needs network): npm run ship:all
 *
 * Phases:
 *  1. typecheck
 *  2. deploy web → proteinquest.vercel.app
 *  3. verify AI analyze-food
 *  4. generate Play Store assets (feature graphic + screenshots)
 *  5. EAS build status + optional new production builds
 *  6. print store submission blockers
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function run(cmd, { inherit = true, optional = false } = {}) {
  console.log(`\n> ${cmd}`);
  const result = spawnSync('/bin/bash', ['-lc', cmd], {
    cwd: ROOT,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0 && !optional) {
    console.error(`\n✗ failed (exit ${result.status ?? 'unknown'}): ${cmd}`);
    return false;
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

function envSet(name) {
  const v = process.env[name]?.trim() ?? '';
  return v.length > 0 && !/your[_-]/i.test(v);
}

function printBlockers() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('Store submission — still manual');
  console.log('══════════════════════════════════════════════════\n');

  const checks = [
    ['EXPO_PUBLIC_REVENUECAT_IOS_KEY', 'RevenueCat iOS public key → .env + EAS secrets'],
    ['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'RevenueCat Android public key → .env + EAS secrets'],
    ['store/google-play-service-account.json', 'Google Play service account JSON (for eas submit)'],
    ['eas.json appleId', 'Replace eas.json submit.production.ios placeholders'],
  ];

  for (const [key, hint] of checks) {
    const ok = key.startsWith('store/') ? existsSync(join(ROOT, key)) : envSet(key);
    console.log(`${ok ? '✓' : '○'} ${key}${ok ? '' : ` — ${hint}`}`);
  }

  console.log(`
Play Store (fastest path):
  1. Play Console → create app com.proteinquest.app
  2. Upload AAB: npx eas build:download --platform android --latest
     (or use build a6331091 from today if still latest)
  3. Internal testing track → add yourself as license tester
  4. Monetize → Subscriptions: pro_weekly + pro_yearly
  5. Store listing: copy from store/play-store-listing.json
     Assets: store/icon-512.png, store/play-feature-graphic.png, store/screenshots/*.png

App Store:
  1. App Store Connect → create ProteinQuest (com.proteinquest.app)
  2. Fill eas.json: appleId, ascAppId, appleTeamId
  3. npx eas build --platform ios --profile production
  4. npx eas submit --platform ios --profile production
  5. Listing copy: store/app-store-listing.json

RevenueCat (both stores):
  → store/revenuecat-setup.json + store/PAYMENTS.md
  → node scripts/sync-revenuecat-keys.mjs (after keys in .env)
  → supabase functions deploy revenuecat-webhook
`);
}

loadEnv();

console.log('ProteinQuest ship-all —', new Date().toISOString());

let ok = true;
ok = run('npx tsc --noEmit') && ok;
ok = run('npm run deploy:prod') && ok;
run('node demo/test-analyze.mjs', { optional: true });

if (ok) {
  run('node demo/generate-feature-graphic.mjs', { optional: true });
  run('node demo/generate-play-screenshots.mjs', { optional: true });
  run('node demo/test-prod-health.mjs', { optional: true });
}

if (envSet('EXPO_TOKEN')) {
  run('npx eas whoami', { optional: true });
  run('npx eas build:list --limit 5 --non-interactive', { optional: true });
} else {
  console.log('\n○ EXPO_TOKEN not set — skipping EAS commands');
}

printBlockers();
process.exit(ok ? 0 : 1);
