#!/usr/bin/env node
/** Push listing copy from store/app-store-listing.json into App Store Connect via API. */
import fs from 'node:fs';
import path from 'node:path';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const VERSION_ID = 'cd945757-2a4a-4cd7-ac53-05ebfed9c396';
const LOCALIZATION_ID = 'a6f1128d-d5dc-42ef-80a5-dd06b4dee586';
const DRAFT_APP_INFO_LOC_ID = '81f2f19d-8867-4cec-a6b5-3ec00732f958';

const listing = JSON.parse(
  fs.readFileSync(path.join('store', 'app-store-listing.json'), 'utf8'),
);

console.log('Updating version string to 1.0.2…');
let r = await asc('PATCH', `/v1/appStoreVersions/${VERSION_ID}`, {
  data: {
    type: 'appStoreVersions',
    id: VERSION_ID,
    attributes: {
      copyright: listing.copyright,
    },
  },
});
console.log('version', r.status, r.json.errors?.[0]?.detail || 'ok');

console.log('Updating en-GB localization…');
r = await asc('PATCH', `/v1/appStoreVersionLocalizations/${LOCALIZATION_ID}`, {
  data: {
    type: 'appStoreVersionLocalizations',
    id: LOCALIZATION_ID,
    attributes: {
      description: listing.description,
      keywords: listing.keywords,
      marketingUrl: listing.marketingUrl,
      promotionalText: listing.promotionalText,
      supportUrl: listing.supportUrl,
    },
  },
});
console.log('localization', r.status, r.json.errors?.[0]?.detail || 'ok');

console.log('Updating draft en-GB subtitle…');
r = await asc('PATCH', `/v1/appInfoLocalizations/${DRAFT_APP_INFO_LOC_ID}`, {
  data: {
    type: 'appInfoLocalizations',
    id: DRAFT_APP_INFO_LOC_ID,
    attributes: {
      subtitle: listing.subtitle,
    },
  },
});
console.log('subtitle', r.status, r.json.errors?.[0]?.detail || 'ok');
