#!/usr/bin/env node
/** Print App Store Connect status for ProteinQuest iOS release. */
import fs from 'node:fs';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const version = process.argv.find((a) => a.startsWith('--version='))?.split('=')[1]
  ?? JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.version;

console.log(`\n=== ProteinQuest iOS App Store status (${version}) ===\n`);

const all = await asc('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`);
console.log('All iOS versions:');
for (const v of all.json.data ?? []) {
  console.log(`  ${v.attributes?.versionString} — ${v.attributes?.appStoreState} — ${v.id}`);
}
if (all.status >= 400) {
  console.log('list versions error', all.status, JSON.stringify(all.json).slice(0, 400));
}

const versions = await asc(
  'GET',
  `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${version}&limit=1`,
);
const versionId = versions.json.data?.[0]?.id;
if (!versionId) {
  console.log('No App Store version found for', version);
  process.exit(0);
}

const v = await asc('GET', `/v1/appStoreVersions/${versionId}`);
console.log('Version ID:', versionId);
console.log('State:', v.json.data?.attributes?.appStoreState);
console.log('Build:', v.json.data?.relationships?.build?.data?.id || '(none)');

const builds = await asc('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5`);
console.log('\nRecent builds:');
for (const b of builds.json.data ?? []) {
  console.log(
    `  ${b.attributes?.version} — ${b.attributes?.processingState} — ${b.id.slice(0, 8)}…`,
  );
}

const open = await asc('GET', `/v1/apps/${APP_ID}/reviewSubmissions?filter[state]=OPEN&limit=1`);
const openId = open.json.data?.[0]?.id;
console.log('\nOPEN review submission:', openId || '(none)');
if (openId) {
  const items = await asc('GET', `/v1/reviewSubmissions/${openId}/items?limit=20`);
  for (const item of items.json.data ?? []) {
    const rel = item.relationships ?? {};
    const kind = Object.keys(rel).find((k) => k !== 'reviewSubmission') ?? '?';
    console.log(`  item ${item.id}: ${kind} ${rel[kind]?.data?.id}`);
  }
}

console.log('');
