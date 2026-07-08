#!/usr/bin/env node
/**
 * Guard against ITMS-90062: CFBundleShortVersionString must exceed the latest
 * approved App Store version.
 *
 * Usage:
 *   node scripts/validate-ios-version.mjs
 *   node scripts/validate-ios-version.mjs --strict   # fail when ASC key missing (CI)
 */
import fs from 'node:fs';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const STRICT = process.argv.includes('--strict');

/** Versions Apple treats as already approved / live (ITMS-90062 baseline). */
const APPROVED_STATES = new Set([
  'READY_FOR_SALE',
  'READY_FOR_DISTRIBUTION',
  'PENDING_APPLE_RELEASE',
  'PROCESSING_FOR_APP_STORE',
  'REPLACED_BY_NEW_VERSION',
]);

function parseVersion(v) {
  return String(v)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function compareSemver(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function hasAscKey() {
  const path =
    process.env.ASC_KEY_PATH ||
    process.env.EXPO_ASC_API_KEY_PATH ||
    './store/AuthKey_JZ3C87NKB9.p8';
  return fs.existsSync(path) || !!process.env.APPLE_ASC_API_KEY_P8;
}

const appVersion = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.version;
console.log(`iOS marketing version in app.json: ${appVersion}`);

if (!hasAscKey()) {
  const msg = 'ASC API key not found — skipping ITMS-90062 check (set store/AuthKey_*.p8 or APPLE_ASC_API_KEY_P8).';
  if (STRICT) {
    console.error(`::error::${msg}`);
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

let cursor = null;
let maxApproved = null;
let maxApprovedState = null;

do {
  const path = cursor
    ? `/v1/apps/${APP_ID}/appStoreVersions?limit=50&cursor=${cursor}`
    : `/v1/apps/${APP_ID}/appStoreVersions?limit=50`;
  const { status, json } = await asc('GET', path);
  if (status !== 200) {
    console.error('ASC API error', status, JSON.stringify(json));
    process.exit(STRICT ? 1 : 0);
  }

  for (const row of json.data ?? []) {
    const versionString = row.attributes?.versionString;
    const state = row.attributes?.appStoreState;
    if (!versionString || !APPROVED_STATES.has(state)) continue;
    if (!maxApproved || compareSemver(versionString, maxApproved) > 0) {
      maxApproved = versionString;
      maxApprovedState = state;
    }
  }

  cursor = json.links?.next
    ? new URL(json.links.next).searchParams.get('cursor')
    : null;
} while (cursor);

if (!maxApproved) {
  console.log('No approved App Store version found in ASC — first release OK.');
  process.exit(0);
}

console.log(`Latest approved ASC version: ${maxApproved} (${maxApprovedState})`);

if (compareSemver(appVersion, maxApproved) <= 0) {
  console.error(
    `\nITMS-90062 risk: app.json version ${appVersion} must be greater than approved ${maxApproved}.`,
  );
  console.error('Bump expo.version in app.json before building/submitting a new IPA.');
  process.exit(1);
}

console.log(`✓ Version ${appVersion} is greater than approved ${maxApproved}`);
