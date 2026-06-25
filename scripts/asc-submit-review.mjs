import fs from 'node:fs';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const VERSION_ID = 'a366bfb9-82d7-43d8-b26f-6ab0e6cc6e1d';
const BUILD_ID = '67a19666-96ad-4ea5-9a3f-3dc919345ecc';
const SUBSCRIPTION_IDS = ['6781793893', '6781793936'];
const listing = JSON.parse(fs.readFileSync('store/app-store-listing.json', 'utf8'));

console.log('Attach build…');
let r = await asc('PATCH', `/v1/appStoreVersions/${VERSION_ID}/relationships/build`, {
  data: { type: 'builds', id: BUILD_ID },
});
console.log('attach', r.status, r.json.errors?.[0]?.detail || 'ok');

console.log('Encryption compliance…');
r = await asc('PATCH', `/v1/builds/${BUILD_ID}`, {
  data: {
    type: 'builds',
    id: BUILD_ID,
    attributes: { usesNonExemptEncryption: false },
  },
});
console.log('encryption', r.status, r.json.errors?.[0]?.detail || 'ok');

console.log('Review detail…');
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

console.log('Create review submission…');
r = await asc('POST', '/v1/reviewSubmissions', {
  data: {
    type: 'reviewSubmissions',
    relationships: {
      app: { data: { type: 'apps', id: APP_ID } },
    },
  },
});
const submissionId = r.json.data?.id;
console.log('submission create', r.status, submissionId || r.json.errors?.[0]?.detail);

if (!submissionId) process.exit(1);

console.log('Add version to submission…');
r = await asc('POST', '/v1/reviewSubmissionItems', {
  data: {
    type: 'reviewSubmissionItems',
    relationships: {
      reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
      appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } },
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
  console.log('subscription item', subId, r.status, r.json.errors?.[0]?.detail || 'ok');
}

console.log('Submit for review…');
r = await asc('PATCH', `/v1/reviewSubmissions/${submissionId}`, {
  data: {
    type: 'reviewSubmissions',
    id: submissionId,
    attributes: { submitted: true },
  },
});
console.log('submitted', r.status, r.json.errors?.[0]?.detail || 'ok');
if (r.status === 200) console.log('\n✓ ProteinQuest iOS 1.0.1 submitted for App Review');
