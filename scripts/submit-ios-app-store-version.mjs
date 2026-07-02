#!/usr/bin/env node
/**
 * Create/update App Store version, attach processed build, submit for review.
 *
 * Usage:
 *   node scripts/submit-ios-app-store-version.mjs
 *   node scripts/submit-ios-app-store-version.mjs --wait-build
 *   node scripts/submit-ios-app-store-version.mjs --version 1.0.4 --build-id <uuid>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc } from './asc-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const APP_ID = process.env.ASC_APP_ID || '6781790996';
const DEFAULT_BUILD_ID = '79c66547-723b-413e-9292-85b410c0a787';

const args = process.argv.slice(2);
const waitBuild = args.includes('--wait-build');
const dryRun = args.includes('--dry-run');
const versionIdx = args.indexOf('--version');
const buildIdx = args.indexOf('--build-id');
const VERSION = versionIdx >= 0 ? args[versionIdx + 1] : process.env.IOS_VERSION || '1.0.4';
const BUILD_ID = buildIdx >= 0 ? args[buildIdx + 1] : process.env.IOS_BUILD_ID || DEFAULT_BUILD_ID;

const listing = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/app-store-listing.json'), 'utf8'));
const WHATS_NEW =
  process.env.IOS_WHATS_NEW ||
  'Paywall and subscription fixes, improved premium restore flow, and stability improvements.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg, json) {
  console.error(msg);
  if (json) console.error(JSON.stringify(json, null, 2));
  process.exit(1);
}

async function pollBuild(maxMin = 45) {
  const deadline = Date.now() + maxMin * 60_000;
  while (Date.now() < deadline) {
    const { status, json } = await asc('GET', `/v1/builds/${BUILD_ID}`);
    if (status !== 200) fail(`Build lookup HTTP ${status}`, json);
    const state = json.data.attributes.processingState;
    const num = json.data.attributes.version;
    console.log(`Build ${num}: ${state}`);
    if (state === 'VALID') return json.data;
    if (state === 'FAILED' || state === 'INVALID') fail(`Build processing ${state}`, json);
    await sleep(30_000);
  }
  fail(`Build still processing after ${maxMin} minutes — re-run with --wait-build`);
}

async function findVersion(versionString) {
  const { status, json } = await asc('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`);
  if (status !== 200) fail(`List versions HTTP ${status}`, json);
  return (json.data || []).find((v) => v.attributes.versionString === versionString) ?? null;
}

async function ensureVersion() {
  let v = await findVersion(VERSION);
  if (v) {
    console.log(`Version ${VERSION} exists (${v.attributes.appStoreState})`);
    return v;
  }
  const body = {
    data: {
      type: 'appStoreVersions',
      attributes: {
        platform: 'IOS',
        versionString: VERSION,
        releaseType: 'AFTER_APPROVAL',
        copyright: listing.copyright || '2026 ProteinQuest',
      },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  };
  const { status, json } = await asc('POST', '/v1/appStoreVersions', body);
  if (status !== 201) fail(`Create version HTTP ${status}`, json);
  console.log(`Created version ${VERSION}`);
  return json.data;
}

async function ensureLocalization(versionId) {
  const { json: list } = await asc('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const loc = list.data?.[0];
  const attrs = {
    locale: listing.primaryLanguage || 'en-GB',
    description: listing.description,
    keywords: listing.keywords,
    marketingUrl: listing.marketingUrl,
    supportUrl: listing.supportUrl,
    whatsNew: WHATS_NEW,
  };
  if (!loc) {
    const { status, json } = await asc('POST', '/v1/appStoreVersionLocalizations', {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: attrs,
        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } },
      },
    });
    if (status !== 201) fail(`Create localization HTTP ${status}`, json);
    console.log('Created localization');
    return;
  }
  const { status, json } = await asc('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { whatsNew: WHATS_NEW } },
  });
  if (status !== 200) fail(`Update whatsNew HTTP ${status}`, json);
  console.log("Updated What's New");
}

async function ensureReviewDetail(versionId) {
  const { json: existing } = await asc('GET', `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`);
  if (existing.data?.id) {
    console.log('Review detail present');
    return;
  }
  const { status, json } = await asc('POST', '/v1/appStoreReviewDetails', {
    data: {
      type: 'appStoreReviewDetails',
      attributes: {
        contactFirstName: 'Kishore',
        contactLastName: 'Putta',
        contactEmail: listing.contactEmail,
        contactPhone: '+447000000000',
        demoAccountRequired: false,
        notes: listing.reviewNotes,
      },
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } },
    },
  });
  if (status !== 201) fail(`Create review detail HTTP ${status}`, json);
  console.log('Created review detail');
}

async function attachBuild(versionId) {
  const { status, json } = await asc('PATCH', `/v1/appStoreVersions/${versionId}`, {
    data: {
      type: 'appStoreVersions',
      id: versionId,
      relationships: { build: { data: { type: 'builds', id: BUILD_ID } } },
    },
  });
  if (status !== 200) fail(`Attach build HTTP ${status}`, json);
  console.log(`Attached build ${json.data?.relationships?.build?.data?.id ?? BUILD_ID}`);
}

async function submitForReview(versionId) {
  const { json: ver } = await asc('GET', `/v1/appStoreVersions/${versionId}`);
  const state = ver.data?.attributes?.appStoreState;
  if (['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE'].includes(state)) {
    console.log(`Already in review pipeline: ${state}`);
    return state;
  }

  // App Store Connect API v2: reviewSubmissions (appStoreVersionSubmissions CREATE is forbidden)
  const { status: rsStatus, json: rsJson } = await asc('POST', '/v1/reviewSubmissions', {
    data: {
      type: 'reviewSubmissions',
      attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  if (rsStatus !== 201) fail(`Create reviewSubmission HTTP ${rsStatus}`, rsJson);
  const submissionId = rsJson.data.id;
  console.log(`Created reviewSubmission ${submissionId}`);

  const { status: itemStatus, json: itemJson } = await asc('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      },
    },
  });
  if (itemStatus !== 201) fail(`Create reviewSubmissionItem HTTP ${itemStatus}`, itemJson);
  console.log('Linked app store version to review submission');

  const { status: subStatus, json: subJson } = await asc('PATCH', `/v1/reviewSubmissions/${submissionId}`, {
    data: {
      type: 'reviewSubmissions',
      id: submissionId,
      attributes: { submitted: true },
    },
  });
  if (subStatus !== 200) fail(`Submit reviewSubmission HTTP ${subStatus}`, subJson);
  console.log('Submitted for App Store review');

  const { json: check } = await asc('GET', `/v1/appStoreVersions/${versionId}`);
  return check.data?.attributes?.appStoreState ?? 'WAITING_FOR_REVIEW';
}

async function main() {
  console.log(`ProteinQuest iOS ${VERSION} → App Store review`);
  if (dryRun) {
    console.log('--dry-run: would wait, attach, submit');
    return;
  }

  if (waitBuild) await pollBuild();
  else {
    const { status, json } = await asc('GET', `/v1/builds/${BUILD_ID}`);
    if (status !== 200) fail(`Build lookup HTTP ${status}`, json);
    const state = json.data.attributes.processingState;
    if (state !== 'VALID') {
      console.log(`Build not VALID (${state}) — use --wait-build or retry later`);
      process.exit(2);
    }
  }

  const version = await ensureVersion();
  const versionId = version.id;
  await ensureLocalization(versionId);
  await ensureReviewDetail(versionId);
  await attachBuild(versionId);

  const finalState = await submitForReview(versionId);
  console.log(`Final state: ${finalState}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
