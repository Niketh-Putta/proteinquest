#!/usr/bin/env node
/**
 * Verify RevenueCat / payments readiness for ProteinQuest.
 * Usage: node scripts/verify-revenuecat-setup.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;

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
  console.log(`${pass ? '✓' : '○'} ${label}${pass ? '' : hint ? ` — ${hint}` : ''}`);
  return pass;
}

loadEnv();

console.log('ProteinQuest — RevenueCat readiness\n');

let score = 0;
const total = 7;

if (ok('Android RC key in .env', !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.startsWith('goog_'))) score++;
if (ok('iOS RC key in .env', !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('appl_'), 'optional until App Store')) score++;
if (ok('Play service account JSON', existsSync(join(ROOT, 'store/google-play-service-account.json')))) score++;
if (ok('react-native-purchases in package.json', readFileSync(join(ROOT, 'package.json'), 'utf8').includes('react-native-purchases'))) score++;
if (ok('Paywall + gating code', existsSync(join(ROOT, 'src/app/paywall.tsx')) && existsSync(join(ROOT, 'src/lib/revenuecat.ts')))) score++;

if (process.env.EXPO_TOKEN) {
  const r = spawnSync('npx', ['eas', 'env:list', '--environment', 'production', '--non-interactive'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  const hasAndroid = r.stdout?.includes('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');
  if (ok('EAS production env has Android RC key', !!hasAndroid)) score++;
} else {
  ok('EAS production env has Android RC key', false, 'set EXPO_TOKEN');
}

const fn = join(ROOT, 'supabase/functions/revenuecat-webhook/index.ts');
if (ok('RevenueCat webhook function in repo', existsSync(fn))) score++;

console.log(`\nCode readiness: ${score}/${total}`);

console.log(`
Still required (Play Console + RevenueCat dashboard):
  ○ Verify bank account — Play Console → Settings → Payments (blocks subscriptions)
  ○ Create subscriptions pro_weekly + pro_yearly
       → node scripts/create-play-subscriptions.mjs (after bank verified)
  ○ RevenueCat: link Android app, products, offering "default"
  ○ RevenueCat webhook URL (deployed):
       https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook
  ○ Ship new AAB with RC key baked in (EAS build production)
`);

process.exit(score >= 5 ? 0 : 1);
