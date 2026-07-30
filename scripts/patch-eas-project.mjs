#!/usr/bin/env node
/**
 * Patch app.json EAS owner/projectId.
 * - play: Play-registered upload keystore project (nikethputta / 16c8d824)
 * - restore: EXPO_TOKEN / iOS credentials project (nikethputta1 / 246d88eb)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APP_JSON = join(ROOT, 'app.json');
const PLAY_PROJECT_ID = '16c8d824-5395-4173-aa70-88218dcb54d5';
const PLAY_OWNER = 'nikethputta';
const IOS_OWNER = 'nikethputta1';
const IOS_PROJECT_ID = '246d88eb-db0c-4937-a681-653a2b7c53fa';

const mode = process.argv[2];
const app = JSON.parse(readFileSync(APP_JSON, 'utf8'));

if (mode === 'play') {
  app.expo.owner = PLAY_OWNER;
  app.expo.extra.eas.projectId = PLAY_PROJECT_ID;
} else if (mode === 'restore') {
  app.expo.owner = IOS_OWNER;
  app.expo.extra.eas.projectId = IOS_PROJECT_ID;
} else {
  console.error('Usage: node scripts/patch-eas-project.mjs play|restore');
  process.exit(1);
}

writeFileSync(APP_JSON, JSON.stringify(app, null, 2) + '\n');
console.log(`app.json → owner=${app.expo.owner} projectId=${app.expo.extra.eas.projectId}`);
