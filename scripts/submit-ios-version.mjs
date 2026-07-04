#!/usr/bin/env node
/**
 * Create or update an App Store version, attach latest processed build, submit for review.
 *
 * Usage:
 *   node scripts/submit-ios-version.mjs --version=1.0.7
 *   node scripts/submit-ios-version.mjs --version=1.0.7 --build-id=<asc-build-uuid>
 *   node scripts/submit-ios-version.mjs --version=1.0.7 --status-only
 */
import fs from 'node:fs';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const SUBSCRIPTION_IDS = ['6781793893', '6781793936'];
const listing = JSON.parse(fs.readFileSync('store/app-store-listing.json', 'utf8'));

const SUBMITTED_STATES = new Set([
  'WAITING_FOR_REVIEW',
  'IN_REVIEW',
  'PENDING_DEVELOPER_RELEASE',
  'READY_FOR_SALE',
  'PROCESSING_FOR_APP_STORE',
  'PENDING_APPLE_RELEASE',
  'REJECTED',
]);

const args = process.argv.slice(2);
const versionArg = args.find((a) => a.startsWith('--version='))?.split('=')[1];
const buildArg = args.find((a) => a.startsWith('--build-id='))?.split('=')[1];
const whatsNewArg = args.find((a) => a.startsWith('--whats-new='))?.split('=')[1];
const statusOnly = args.includes('--status-only');

if (!versionArg) {
  console.error(
    'Usage: node scripts/submit-ios-version.mjs --version=1.0.7 [--build-id=...] [--whats-new=...] [--status-only]',
  );
  process.exit(1);
}

const whatsNew =
  whatsNewArg ??
  'Fixes App Store subscription purchases on the paywall, extends the free trial to 3 days, and improves meal scan reliability.';

function errDetail(json) {
  const e = json?.errors?.[0];
  if (!e) return JSON.stringify(json).slice(0, 300);
  return `${e.code || e.status}: ${e.detail || e.title}`;
}

async function findOrCreateVersion(versionString) {
  const existing = await asc(
    'GET',
    `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${versionString}&limit=1`,
  );
  let versionId = existing.json.data?.[0]?.id;
  if (versionId) {
    console.log('Using existing version', versionString, versionId);
    return versionId;
  }

  const created = await asc('POST', '/v1/appStoreVersions', {
    data: {
      type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  versionId = created.json.data?.id;
  if (!versionId) throw new Error(errDetail(created.json) || 'Could not create version');
  console.log('Created version', versionString, versionId);
  return versionId;
}

async function getVersionState(versionId) {
  const r = await asc('GET', `/v1/appStoreVersions/${versionId}`);
  const state = r.json.data?.attributes?.appStoreState;
  const buildRel = r.json.data?.relationships?.build?.data?.id;
  console.log('Version state:', state || 'unknown', buildRel ? `(build ${buildRel})` : '(no build)');
  return { state, buildRel, raw: r.json.data };
}

async function logVersionBlockers(versionId) {
  const submission = await asc('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionSubmission`);
  if (submission.status === 200 && submission.json.data) {
    console.log('appStoreVersionSubmission:', JSON.stringify(submission.json.data.attributes ?? {}, null, 2));
  }

  const locs = await asc('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  for (const loc of locs.json.data ?? []) {
    const sets = await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
    const count = (sets.json.data ?? []).length;
    console.log(`Localization ${loc.attributes?.locale}: ${count} screenshot set(s)`);
  }
}

async function ensureLocalization(versionId) {
  const locs = await asc('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  if (locs.json.data?.length) {
    const locId = locs.json.data[0].id;
    const r = await asc('PATCH', `/v1/appStoreVersionLocalizations/${locId}`, {
      data: {
        type: 'appStoreVersionLocalizations',
        id: locId,
        attributes: { whatsNew },
      },
    });
    console.log('whatsNew', r.status, r.json.errors?.[0]?.detail || 'ok');
    return;
  }

  const template = await asc('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=READY_FOR_SALE&limit=1`);
  const srcVersionId = template.json.data?.[0]?.id;
  if (!srcVersionId) return;
  const srcLocs = await asc('GET', `/v1/appStoreVersions/${srcVersionId}/appStoreVersionLocalizations`);
  const src = srcLocs.json.data?.[0];
  if (!src) return;

  const r = await asc('POST', '/v1/appStoreVersionLocalizations', {
    data: {
      type: 'appStoreVersionLocalizations',
      attributes: {
        locale: src.attributes.locale,
        description: src.attributes.description,
        keywords: src.attributes.keywords,
        marketingUrl: src.attributes.marketingUrl,
        promotionalText: src.attributes.promotionalText,
        supportUrl: src.attributes.supportUrl,
        whatsNew,
      },
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } },
    },
  });
  console.log('localization', r.status, r.json.errors?.[0]?.detail || 'ok');
}

async function findLatestBuildId(preferVersionString) {
  const builds = await asc('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=20`);
  const list = builds.json.data ?? [];
  const valid = list.filter((b) => b.attributes?.processingState === 'VALID');
  if (!valid.length) throw new Error('No VALID build found in App Store Connect yet');

  const preferred = preferVersionString
    ? valid.find((b) => String(b.attributes?.version) === String(preferVersionString))
    : null;
  const ready = preferred ?? valid[0];
  console.log('Latest VALID build', ready.attributes.version, ready.id);
  return ready.id;
}

async function getOpenReviewSubmissionId() {
  const open = await asc('GET', `/v1/apps/${APP_ID}/reviewSubmissions?filter[state]=OPEN&limit=1`);
  const id = open.json.data?.[0]?.id;
  if (id) console.log('Found OPEN review submission', id);
  return id ?? null;
}

async function listReviewSubmissionItems(submissionId) {
  const r = await asc('GET', `/v1/reviewSubmissions/${submissionId}/items?limit=50`);
  return r.json.data ?? [];
}

async function ensureReviewSubmissionItem(submissionId, relationships) {
  const items = await listReviewSubmissionItems(submissionId);
  const relType = Object.keys(relationships)[0];
  const relId = relationships[relType]?.data?.id;
  const existing = items.find((item) => item.relationships?.[relType]?.data?.id === relId);
  if (existing) {
    console.log('review item already present', relType, relId);
    return existing.id;
  }

  const r = await asc('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
        ...relationships,
      },
    },
  });
  console.log('review item', relType, relId, r.status, r.json.errors?.[0]?.detail || 'ok');
  if (r.status >= 400) throw new Error(`Add review item failed: ${errDetail(r.json)}`);
  return r.json.data?.id;
}

async function getOrCreateOpenReviewSubmission() {
  const existingId = await getOpenReviewSubmissionId();
  if (existingId) return existingId;

  const r = await asc('POST', '/v1/reviewSubmissions', {
    data: {
      type: 'reviewSubmissions',
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  const submissionId = r.json.data?.id;
  console.log('create submission', r.status, submissionId || errDetail(r.json));
  if (!submissionId) {
    const retryOpen = await getOpenReviewSubmissionId();
    if (retryOpen) return retryOpen;
    throw new Error(`Could not create review submission: ${errDetail(r.json)}`);
  }
  return submissionId;
}

async function submitVersion(versionId, buildId) {
  const { state } = await getVersionState(versionId);
  if (state && SUBMITTED_STATES.has(state)) {
    console.log(`\n✓ ProteinQuest iOS ${versionArg} already in App Store state: ${state}`);
    return;
  }
  if (state && state !== 'PREPARE_FOR_SUBMISSION' && state !== 'DEVELOPER_REJECTED') {
    await logVersionBlockers(versionId);
    throw new Error(`Version ${versionArg} is not ready for submission (state=${state})`);
  }

  let r = await asc('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: buildId },
  });
  console.log('attach build', r.status, r.json.errors?.[0]?.detail || 'ok');
  if (r.status >= 400) throw new Error(`Attach build failed: ${errDetail(r.json)}`);

  r = await asc('PATCH', `/v1/builds/${buildId}`, {
    data: {
      type: 'builds',
      id: buildId,
      attributes: { usesNonExemptEncryption: false },
    },
  });
  if (r.status === 409) {
    console.log('encryption already set (409 ok)');
  } else {
    console.log('encryption', r.status, r.json.errors?.[0]?.detail || 'ok');
  }

  const detail = await asc('GET', `/v1/apps/${APP_ID}/appStoreReviewDetail`);
  const detailId = detail.json.data?.id;
  if (detailId) {
    r = await asc('PATCH', `/v1/appStoreReviewDetails/${detailId}`, {
      data: {
        type: 'appStoreReviewDetails',
        id: detailId,
        attributes: {
          contactEmail: listing.contactEmail,
          contactFirstName: 'Kishore',
          contactLastName: 'Putta',
          contactPhone: listing.contactPhone || '+447700900123',
          notes: listing.reviewNotes,
        },
      },
    });
    console.log('review detail', r.status, r.json.errors?.[0]?.detail || 'ok');
  }

  const submissionId = await getOrCreateOpenReviewSubmission();
  await ensureReviewSubmissionItem(submissionId, {
    appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
  });
  for (const subId of SUBSCRIPTION_IDS) {
    await ensureReviewSubmissionItem(submissionId, {
      subscription: { data: { type: 'subscriptions', id: subId } },
    });
  }

  r = await asc('PATCH', `/v1/reviewSubmissions/${submissionId}`, {
    data: { type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true, platform: 'IOS' } },
  });
  console.log('submitted', r.status, r.json.errors?.[0]?.detail || 'ok');
  if (r.status === 200) {
    console.log(`\n✓ ProteinQuest iOS ${versionArg} submitted for App Review`);
    return;
  }

  await logVersionBlockers(versionId);
  throw new Error(`Submit for review failed: ${errDetail(r.json)}`);
}

const versionId = await findOrCreateVersion(versionArg);

if (statusOnly) {
  await getVersionState(versionId);
  await logVersionBlockers(versionId);
  const open = await getOpenReviewSubmissionId();
  if (open) {
    const items = await listReviewSubmissionItems(open);
    console.log('OPEN submission items:', items.length);
  }
  process.exit(0);
}

await ensureLocalization(versionId);
const buildId = buildArg ?? (await findLatestBuildId());
await submitVersion(versionId, buildId);
