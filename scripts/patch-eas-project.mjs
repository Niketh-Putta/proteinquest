#!/usr/bin/env node
/** Patch app.json to use the Play-registered EAS project (nikethputta / 16c8d824). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APP_JSON = join(ROOT, 'app.json');
const PLAY_PROJECT_ID = '16c8d824-5395-4173-aa70-88218dcb54d5';
const PLAY_OWNER = 'nikethputta';

const mode = process.argv[2];
const app = JSON.parse(readFileSync(APP_JSON, 'utf8'));

if (mode === 'play') {
  app.expo.owner = PLAY_OWNER;
  app.expo.extra.eas.projectId = PLAY_PROJECT_ID;
} else if (mode === 'restore') {
  app.expo.owner = 'nikethputta1';
  app.expo.extra.eas.projectId = '246d88eb-db0c-4937-a681-653a2b7c53fa';
} else {
  console.error('Usage: node scripts/patch-eas-project.mjs play|restore');
  process.exit(1);
}

writeFileSync(APP_JSON, JSON.stringify(app, null, 2) + '\n');
console.log(`app.json → owner=${app.expo.owner} projectId=${app.expo.extra.eas.projectId}`);
