#!/usr/bin/env node
/** Report ProteinQuest iOS ship status from App Store Connect API. */
import fs from 'node:fs';
import { asc } from './asc-api.mjs';

const APP_ID = process.env.ASC_APP_ID || '6781790996';
const TARGET_VERSION = process.env.IOS_VERSION || '1.0.4';
const TARGET_BUILD = process.env.IOS_BUILD_NUMBER || '21';
const TARGET_BUILD_ID = process.env.IOS_BUILD_ID || '79c66547-723b-413e-9292-85b410c0a787';

function pickBuild(b) {
  return {
    id: b.id,
    number: b.attributes?.version,
    state: b.attributes?.processingState,
    uploaded: b.attributes?.uploadedDate,
    marketing: null,
  };
}

async function main() {
  const live = await fetch(`https://itunes.apple.com/lookup?bundleId=com.proteinquest.app`).then((r) =>
    r.json(),
  );
  const store = live.results?.[0];

  const { status: buildStatus, json: buildJson } = await asc('GET', `/v1/builds/${TARGET_BUILD_ID}`);
  const build = buildStatus === 200 ? buildJson.data : null;

  const { json: versionsJson } = await asc(
    'GET',
    `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`,
  );
  const versions = (versionsJson.data || []).map((v) => ({
    version: v.attributes.versionString,
    state: v.attributes.appStoreState,
    id: v.id,
  }));

  const target = versions.find((v) => v.version === TARGET_VERSION);
  let attachedBuild = null;
  let whatsNew = null;
  if (target) {
    const { json: bj } = await asc('GET', `/v1/appStoreVersions/${target.id}/build`);
    attachedBuild = bj.data?.attributes?.version ?? null;
    const { json: lj } = await asc('GET', `/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations`);
    whatsNew = lj.data?.[0]?.attributes?.whatsNew ?? null;
  }

  const { json: tfJson } = await asc(
    'GET',
    `/v1/preReleaseVersions?filter[app]=${APP_ID}&filter[platform]=IOS&limit=5`,
  );
  const trains = (tfJson.data || []).map((t) => t.attributes.version);

  console.log('=== ProteinQuest iOS ship status ===');
  console.log(`Live App Store: v${store?.version ?? '?'} — ${store?.trackViewUrl ?? 'n/a'}`);
  console.log(`TestFlight trains: ${trains.join(', ') || 'none'}`);
  if (build) {
    console.log(
      `Build ${build.attributes.version} (${TARGET_BUILD_ID.slice(0, 8)}…): ${build.attributes.processingState} (uploaded ${build.attributes.uploadedDate})`,
    );
  } else {
    console.log(`Build lookup failed: HTTP ${buildStatus}`);
  }
  console.log('App Store versions:');
  for (const v of versions) {
    const mark = v.version === TARGET_VERSION ? ' ← target' : '';
    console.log(`  ${v.version}: ${v.state}${mark}`);
  }
  if (target) {
    console.log(`1.0.4 attached build: ${attachedBuild ?? 'none'}`);
    console.log(`1.0.4 What's New: ${whatsNew ? 'set' : 'MISSING'}`);
  } else {
    console.log(`Version ${TARGET_VERSION} not created yet`);
  }

  const ready =
    build?.attributes?.processingState === 'VALID' &&
    target &&
    attachedBuild === TARGET_BUILD &&
    ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE'].includes(
      target.state,
    );

  console.log(ready ? '\n✓ Submitted or live' : '\n○ Not submitted yet');
  process.exit(ready ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
