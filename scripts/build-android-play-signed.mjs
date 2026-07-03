#!/usr/bin/env node
/**
 * Build Android AAB with the Play-registered upload key (nikethputta / 16c8d824 project)
 * then submit to Play production for review.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APP_JSON = join(ROOT, 'app.json');
const PLAY_PROJECT_ID = '16c8d824-5395-4173-aa70-88218dcb54d5';
const PLAY_OWNER = 'nikethputta';

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

function run(cmd) {
  console.log(`\n> ${cmd}`);
  const r = spawnSync('/bin/bash', ['-lc', cmd], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

loadEnv();
if (!process.env.JAVA_HOME) {
  const jdk = join(ROOT, '.tools/jdk-17.0.19+10/Contents/Home');
  if (existsSync(jdk)) process.env.JAVA_HOME = jdk;
}
if (process.env.JAVA_HOME) {
  process.env.PATH = `${process.env.JAVA_HOME}/bin:${process.env.PATH ?? ''}`;
}
if (!process.env.EXPO_TOKEN?.trim()) {
  console.error('EXPO_TOKEN required (nikethputta account with Play upload key).');
  process.exit(1);
}

const whoami = execFileSync('npx', ['eas-cli', 'whoami'], { cwd: ROOT, encoding: 'utf8' }).trim();
if (!whoami.includes(PLAY_OWNER)) {
  console.error(`Expected EAS account ${PLAY_OWNER}, got: ${whoami}`);
  process.exit(1);
}

const original = readFileSync(APP_JSON, 'utf8');
const app = JSON.parse(original);
const backup = { owner: app.expo.owner, projectId: app.expo.extra.eas.projectId };
app.expo.owner = PLAY_OWNER;
app.expo.extra.eas.projectId = PLAY_PROJECT_ID;
writeFileSync(APP_JSON, JSON.stringify(app, null, 2) + '\n');

try {
  for (const name of [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_KEY',
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  ]) {
    const val = process.env[name];
    if (val) {
      run(
        `npx eas-cli env:create --name ${name} --value '${val.replace(/'/g, "'\\''")}' --environment production --visibility sensitive --force --non-interactive || true`,
      );
    }
  }

  run('EAS_BUILD_NO_EXPO_GO_WARNING=true npx eas-cli build --platform android --profile production --local --non-interactive --output store/proteinquest.aab');

  if (!existsSync(join(ROOT, 'store/google-play-service-account.json'))) {
    console.error('Missing store/google-play-service-account.json');
    process.exit(1);
  }

  run('node scripts/upload-aab-to-play.mjs --track=production');
  console.log('\n✓ Android 1.0.5 uploaded to Play production track.');
} finally {
  const restored = JSON.parse(readFileSync(APP_JSON, 'utf8'));
  restored.expo.owner = backup.owner;
  restored.expo.extra.eas.projectId = backup.projectId;
  writeFileSync(APP_JSON, JSON.stringify(restored, null, 2) + '\n');
}
