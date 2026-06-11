#!/usr/bin/env node
/**
 * Sync RevenueCat public SDK keys from .env → EAS secrets + GitHub Actions secrets.
 * Usage: node scripts/sync-revenuecat-keys.mjs
 *
 * Requires in .env (or environment):
 *   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
 *   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
 *   EXPO_TOKEN (for EAS)
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireKey(name) {
  const value = process.env[name]?.trim();
  if (!value || /your[_-]/i.test(value)) {
    console.error(`Missing or placeholder: ${name}`);
    console.error('Add real keys to .env from RevenueCat → Project Settings → API keys');
    process.exit(1);
  }
  return value;
}

function easSecretSet(name, value) {
  const result = spawnSync(
    'npx',
    ['eas-cli', 'secret:create', '--name', name, '--value', value, '--force', '--non-interactive'],
    { stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ghSecretSet(name, value) {
  execSync(`gh secret set ${name}`, {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

loadEnv();

const iosKey = requireKey('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
const androidKey = requireKey('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');

console.log('iOS key:', iosKey.slice(0, 12) + '…');
console.log('Android key:', androidKey.slice(0, 12) + '…');

if (!process.env.EXPO_TOKEN?.trim()) {
  console.warn('EXPO_TOKEN not set — skipping EAS secrets');
} else {
  console.log('\nSyncing to EAS…');
  easSecretSet('EXPO_PUBLIC_REVENUECAT_IOS_KEY', iosKey);
  easSecretSet('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', androidKey);
}

try {
  execSync('gh auth status', { stdio: 'pipe' });
  console.log('\nSyncing to GitHub Actions secrets…');
  ghSecretSet('EXPO_PUBLIC_REVENUECAT_IOS_KEY', iosKey);
  ghSecretSet('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', androidKey);
} catch {
  console.warn('gh not authenticated — skipping GitHub secrets');
}

console.log('\nDone. Native EAS builds will pick up RevenueCat keys on next build.');
