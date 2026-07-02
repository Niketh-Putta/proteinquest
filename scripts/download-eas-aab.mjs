#!/usr/bin/env node
/**
 * Download the signed AAB for an EAS build id (avoids eas build:download tar extraction issues).
 *
 * Usage:
 *   EXPO_TOKEN=... node scripts/download-eas-aab.mjs <build-id>
 *   EXPO_TOKEN=... node scripts/download-eas-aab.mjs <build-id> --out store/proteinquest.aab
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const buildId = args[0]?.trim();
const outPath = outArg?.split('=')[1] ?? join(ROOT, 'store/proteinquest.aab');

if (!buildId) {
  console.error('Usage: node scripts/download-eas-aab.mjs <build-id> [--out=path]');
  process.exit(1);
}

if (!process.env.EXPO_TOKEN?.trim()) {
  console.error('EXPO_TOKEN is required');
  process.exit(1);
}

const viewJson = execFileSync(
  'npx',
  ['eas-cli', 'build:view', buildId, '--json'],
  { cwd: ROOT, encoding: 'utf8', env: process.env },
);

const build = JSON.parse(viewJson);
const url =
  build?.artifacts?.applicationArchiveUrl ||
  build?.artifacts?.buildUrl ||
  build?.applicationArchiveUrl ||
  '';

if (!url) {
  console.error('No applicationArchiveUrl in build view JSON:', viewJson.slice(0, 500));
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok || !res.body) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(outPath));
console.log(`Saved ${outPath} (${Math.round(Number(res.headers.get('content-length') ?? 0) / (1024 * 1024))} MB)`);
