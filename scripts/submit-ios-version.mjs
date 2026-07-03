#!/usr/bin/env node
/**
 * Create or update an App Store version, attach latest processed build, submit for review.
 *
 * Usage:
 *   node scripts/submit-ios-version.mjs --version 1.0.5
 *   node scripts/submit-ios-version.mjs --version 1.0.5 --build-id <asc-build-uuid>
 */
import fs from 'node:fs';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const SUBSCRIPTION_IDS = ['6781793893', '6781793936'];
const listing = JSON.parse(fs.readFileSync('store/app-store-listing.json', 'utf8'));

const args = process.argv.slice(2);
const versionArg = args.find((a) => a.startsWith('--version='))?.split('=')[1];
const buildArg = args.find((a) => a.startsWith('--build-id='))?.split('=')[1];
const whatsNewArg = args.find((a) => a.startsWith('--whats-new='))?.split('=')[1];

if (!versionArg) {
  console.error('Usage: node scripts/submit-ios-version.mjs --version=1.0.5 [--build-id=...] [--whats-new=...]');
  process.exit(1);
}

const whatsNew =
  whatsNewArg ??
  'Personalized meal reminders, subscription billing details in Settings, improved scan close button placement, and real App Store payments via RevenueCat.';

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
  if (!versionId) throw new Error(created.json.errors?.[0]?.detail || 'Could not create version');
  console.log('Created version', versionString, versionId);
  return versionId;
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

async function findLatestBuildId() {
  const builds = await asc('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=10`);
  const ready = (builds.json.data ?? []).find((b) => b.attributes?.processingState === 'VALID');
  if (!ready) throw new Error('No VALID build found in App Store Connect yet');
  console.log('Latest VALID build', ready.attributes.version, ready.id);
  return ready.id;
}

async function submitVersion(versionId, buildId) {
  let r = await asc('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: buildId },
  });
  console.log('attach build', r.status, r.json.errors?.[0]?.detail || 'ok');
  if (r.status >= 400) throw new Error('Attach build failed');

  r = await asc('PATCH', `/v1/builds/${buildId}`, {
    data: {
      type: 'builds',
      id: buildId,
      attributes: { usesNonExemptEncryption: false },
    },
  });
  console.log('encryption', r.status, r.json.errors?.[0]?.detail || 'ok');

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
          contactPhone: '+440000000000',
          notes: listing.reviewNotes,
        },
      },
    });
    console.log('review detail', r.status, r.json.errors?.[0]?.detail || 'ok');
  }

  r = await asc('POST', '/v1/reviewSubmissions', {
    data: {
      type: 'reviewSubmissions',
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  const submissionId = r.json.data?.id;
  console.log('submission', r.status, submissionId || r.json.errors?.[0]?.detail);
  if (!submissionId) throw new Error('Could not create review submission');

  r = await asc('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      },
    },
  });
  console.log('version item', r.status, r.json.errors?.[0]?.detail || 'ok');

  for (const subId of SUBSCRIPTION_IDS) {
    r = await asc('POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
          subscription: { data: { type: 'subscriptions', id: subId } },
        },
      },
    });
    console.log('sub item', subId, r.status, r.json.errors?.[0]?.detail || 'ok');
  }

  r = await asc('PATCH', `/v1/reviewSubmissions/${submissionId}`, {
    data: { type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true } },
  });
  console.log('submitted', r.status, r.json.errors?.[0]?.detail || 'ok');
  if (r.status === 200) console.log(`\n✓ ProteinQuest iOS ${versionArg} submitted for App Review`);
}

const versionId = await findOrCreateVersion(versionArg);
await ensureLocalization(versionId);
const buildId = buildArg ?? (await findLatestBuildId());
await submitVersion(versionId, buildId);
