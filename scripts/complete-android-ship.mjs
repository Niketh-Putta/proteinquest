#!/usr/bin/env node
/**
 * Complete Android ship after EXPO_TOKEN is available.
 * Usage:
 *   EXPO_TOKEN=... node scripts/complete-android-ship.mjs
 *   node scripts/complete-android-ship.mjs   # reads EXPO_TOKEN from env or .env
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

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

function run(cmd, { input, inherit = true } = {}) {
  console.log(`\n> ${cmd}`);
  const result = spawnSync('/bin/bash', ['-lc', cmd], {
    cwd: ROOT,
    stdio: inherit ? 'inherit' : 'pipe',
    input,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd}`);
  }
  return result.stdout ?? '';
}

loadEnv();
const token = process.env.EXPO_TOKEN?.trim();
if (!token) {
  console.error(`
EXPO_TOKEN is missing.

In your browser (already opened if you ran the agent setup):
1. Expo → Access Tokens → Create token
2. GitHub → repo Settings → Secrets → Actions → New secret
   Name: EXPO_TOKEN
   Value: paste the Expo token

Then either:
  export EXPO_TOKEN='your-token'
  node scripts/complete-android-ship.mjs

Or re-run the GitHub Action: Build and submit Android
`);
  process.exit(1);
}

try {
  execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  try {
    run(`printf '%s' "${token.replace(/"/g, '\\"')}" | gh secret set EXPO_TOKEN`);
    console.log('✓ GitHub secret EXPO_TOKEN updated');
  } catch {
    console.warn('○ Could not set GitHub secret (needs repo admin gh auth). CI submit skipped.');
  }
} catch {
  console.warn('○ gh not authenticated — skipping GitHub secret sync');
}

run('npx eas-cli whoami');
run('npx eas-cli build --platform android --profile production --non-interactive --wait');

if (existsSync(join(ROOT, 'store/google-play-service-account.json'))) {
  run('npx eas-cli submit --platform android --profile production --latest --non-interactive');
  console.log('\n✓ Submitted to Play internal testing. Update the app on your phone from Play Console internal test link.');
} else {
  console.log('\nBuild finished. Upload/submit via Play Console internal testing or add store/google-play-service-account.json');
}
