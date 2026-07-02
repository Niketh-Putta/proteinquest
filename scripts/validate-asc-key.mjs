#!/usr/bin/env node
/** Verify APPLE_ASC_API_KEY_P8 works against App Store Connect API. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { asc } from './asc-api.mjs';
import { normalizeKeyId, normalizeP8 } from './normalize-p8.cjs';

const KEY_ID = normalizeKeyId(
  process.env.EXPO_ASC_KEY_ID || process.env.APPLE_ASC_KEY_ID || 'JZ3C87NKB9',
);
const ISSUER_ID = (
  process.env.EXPO_ASC_ISSUER_ID ||
  process.env.APPLE_ASC_ISSUER_ID ||
  '75ae36fa-911c-462c-818e-f1bcc4222c24'
).trim();
const keyPath = process.env.EXPO_ASC_API_KEY_PATH || `./store/AuthKey_${KEY_ID}.p8`;
const raw = process.env.APPLE_ASC_API_KEY_P8 || (fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8') : '');
const keyP8 = normalizeP8(raw);

if (!keyP8) {
  console.error('No ASC key content');
  process.exit(1);
}

if (!/^[A-Z0-9]{10}$/.test(KEY_ID)) {
  console.error(
    `APPLE_ASC_KEY_ID must be exactly 10 characters (A-Z, 0-9). Got length ${KEY_ID.length}.`,
  );
  console.error('Copy Key ID from App Store Connect → Users and Access → Integrations → App Store Connect API.');
  process.exit(1);
}

try {
  crypto.createPrivateKey(keyP8);
} catch (err) {
  console.error('ASC private key is malformed and cannot be parsed:', err.message);
  console.error(
    'Re-copy the full .p8 into APPLE_ASC_API_KEY_P8, including BEGIN/END lines, with no extra text.',
  );
  process.exit(1);
}

fs.mkdirSync('store', { recursive: true });
fs.writeFileSync(keyPath, keyP8);

process.env.ASC_KEY_ID = KEY_ID;
process.env.ASC_KEY_PATH = keyPath;
process.env.ASC_ISSUER_ID = ISSUER_ID;

console.log(`Checking ASC key ${KEY_ID} (issuer ${ISSUER_ID.slice(0, 8)}…, ${keyP8.length} bytes)`);

const { status, json } = await asc('GET', '/v1/apps?limit=1');
if (status === 200) {
  console.log(`ASC key ${KEY_ID} is valid (HTTP ${status})`);
  process.exit(0);
}

const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || JSON.stringify(json).slice(0, 200);
console.error(`ASC key ${KEY_ID} rejected: HTTP ${status} — ${detail}`);
if (status === 401) {
  console.error('');
  console.error('Common fixes:');
  console.error('1. APPLE_ASC_KEY_ID must match the Key ID shown in App Store Connect for this .p8');
  console.error('2. APPLE_ASC_API_KEY_P8 must be the exact .p8 downloaded with that Key ID (one download only)');
  console.error('3. Issuer ID on Integrations tab must match APPLE_ASC_ISSUER_ID (or leave unset to use default)');
  console.error('4. Key must not be revoked; regenerate if needed');
}
process.exit(1);
