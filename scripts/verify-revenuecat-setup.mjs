#!/usr/bin/env node
/**
 * Verify RevenueCat / payments readiness for ProteinQuest.
 * Usage: node scripts/verify-revenuecat-setup.mjs
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGE = 'com.proteinquest.app';

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

async function playSubsActive() {
  const saPath = join(ROOT, 'store/google-play-service-account.json');
  if (!existsSync(saPath)) return false;
  const sa = JSON.parse(readFileSync(saPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const jwt = `${unsigned}.${sign.sign(sa.private_key, 'base64url')}`;
  const tokenRes = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const token = (await tokenRes.json()).access_token;
  if (!token) return false;

  for (const id of ['pro_weekly', 'pro_yearly']) {
    const res = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/subscriptions/${id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return false;
    const sub = await res.json();
    const active = sub.basePlans?.some((p) => p.state === 'ACTIVE');
    if (!active) return false;
  }
  return true;
}

async function main() {
  loadEnv();

  console.log('ProteinQuest — RevenueCat readiness\n');

  let score = 0;
  const total = 9;

  if (ok('Android RC key in .env', !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.startsWith('goog_'))) score++;
  if (ok('iOS RC key in .env', !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('appl_'))) score++;
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
    const hasIos = r.stdout?.includes('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
    if (ok('EAS production env has Android RC key', !!hasAndroid)) score++;
    if (ok('EAS production env has iOS RC key', !!hasIos)) score++;
  } else {
    ok('EAS production env has Android RC key', false, 'set EXPO_TOKEN');
    ok('EAS production env has iOS RC key', false, 'set EXPO_TOKEN');
  }

  const fn = join(ROOT, 'supabase/functions/revenuecat-webhook/index.ts');
  if (ok('RevenueCat webhook function in repo', existsSync(fn))) score++;
  if (ok('Play subscriptions active (API)', await playSubsActive())) score++;

  console.log(`\nCode readiness: ${score}/${total}`);

  console.log(`
Still required (RevenueCat dashboard — no secret API key in repo):
  ○ RevenueCat → Android app → upload store/google-play-service-account.json
  ○ RevenueCat → Products → import pro_weekly, pro_yearly (Play)
  ○ RevenueCat → Offerings → default (current) → $rc_weekly + $rc_annual → entitlement pro
  ○ RevenueCat webhook URL:
       https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook
  ○ Ship AAB with EXPO_PUBLIC_REVENUECAT_ANDROID_KEY baked in (CI build-android.yml)
`);

  process.exit(score >= 6 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
