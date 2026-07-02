#!/usr/bin/env node
/** Verify APPLE_ASC_API_KEY_P8 works against App Store Connect API. */
import fs from 'node:fs';
import { asc } from './asc-api.mjs';
import { normalizeP8 } from './normalize-p8.cjs';

const KEY_ID = process.env.EXPO_ASC_KEY_ID || process.env.APPLE_ASC_KEY_ID || 'JZ3C87NKB9';
const keyPath = process.env.EXPO_ASC_API_KEY_PATH || `./store/AuthKey_${KEY_ID}.p8`;
const raw = process.env.APPLE_ASC_API_KEY_P8 || (fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8') : '');
const keyP8 = normalizeP8(raw);
if (!keyP8) {
  console.error('No ASC key content');
  process.exit(1);
}
fs.mkdirSync('store', { recursive: true });
fs.writeFileSync(keyPath, keyP8);
process.env.ASC_KEY_ID = KEY_ID;
process.env.ASC_KEY_PATH = keyPath;

const { status, json } = await asc('GET', '/v1/apps?limit=1');
if (status === 200) {
  console.log(`ASC key ${KEY_ID} is valid (HTTP ${status})`);
  process.exit(0);
}
console.error(`ASC key ${KEY_ID} rejected: HTTP ${status}`, JSON.stringify(json?.errors?.[0] ?? json).slice(0, 300));
process.exit(1);
