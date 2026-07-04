import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { asc } from './asc-api.mjs';

const APP_ID = '6781790996';
const versionString = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.version;

async function resolveVersionLocalizationId() {
  const versions = await asc(
    'GET',
    `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${versionString}&limit=1`,
  );
  const versionId = versions.json.data?.[0]?.id;
  if (!versionId) {
    throw new Error(`No App Store version ${versionString} — create it in ASC first`);
  }
  const locs = await asc('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const locId = locs.json.data?.[0]?.id;
  if (!locId) {
    throw new Error(`No localization on version ${versionString} (${versionId})`);
  }
  console.log('Screenshot localization', versionString, locId);
  return locId;
}

const sets = [
  {
    displayType: 'APP_IPHONE_67',
    dir: 'store/screenshots/iphone67',
  },
  {
    displayType: 'APP_IPAD_PRO_3GEN_129',
    dir: 'store/screenshots/ipad13',
  },
];

async function ensureScreenshotSet(locId, displayType) {
  const existing = await asc('GET', `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets`);
  const found = (existing.json.data ?? []).find((s) => s.attributes?.screenshotDisplayType === displayType);
  if (found) return found.id;
  const created = await asc('POST', '/v1/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: displayType },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: 'appStoreVersionLocalizations', id: locId },
        },
      },
    },
  });
  if (created.status !== 201) {
    throw new Error(`create set ${displayType}: ${created.status} ${created.json.errors?.[0]?.detail}`);
  }
  return created.json.data.id;
}

async function clearScreenshotSet(setId) {
  const existing = await asc('GET', `/v1/appScreenshotSets/${setId}/appScreenshots`);
  for (const s of existing.json.data ?? []) {
    const del = await asc('DELETE', `/v1/appScreenshots/${s.id}`);
    console.log('  deleted old', s.id, del.status);
  }
}

async function uploadScreenshot(setId, filePath) {
  const fileName = path.basename(filePath);
  const size = fs.statSync(filePath).size;
  const reserve = await asc('POST', '/v1/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize: size },
      relationships: {
        appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } },
      },
    },
  });
  if (reserve.status !== 201) {
    throw new Error(`reserve ${fileName}: ${reserve.status} ${reserve.json.errors?.[0]?.detail}`);
  }
  const up = reserve.json.data.attributes.uploadOperations?.[0];
  if (!up) throw new Error(`no upload op for ${fileName}`);
  const body = fs.readFileSync(filePath);
  const md5 = crypto.createHash('md5').update(body).digest('hex');
  const res = await fetch(up.url, {
    method: up.method || 'PUT',
    headers: Object.fromEntries((up.headers ?? []).map((h) => [h.name, h.value])),
    body,
  });
  if (!res.ok) throw new Error(`upload ${fileName} HTTP ${res.status}`);
  const commit = await asc('PATCH', `/v1/appScreenshots/${reserve.json.data.id}`, {
    data: {
      type: 'appScreenshots',
      id: reserve.json.data.id,
      attributes: { uploaded: true, sourceFileChecksum: md5 },
    },
  });
  if (commit.status !== 200) {
    throw new Error(`commit ${fileName}: ${commit.status} ${commit.json.errors?.[0]?.detail}`);
  }
  console.log('  uploaded', fileName);
}

for (const { displayType, dir } of sets) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  console.log(displayType, files.length, 'files');
  const versionLocId = await resolveVersionLocalizationId();
  const setId = await ensureScreenshotSet(versionLocId, displayType);
  await clearScreenshotSet(setId);
  for (const f of files) {
    await uploadScreenshot(setId, path.join(dir, f));
  }
}
console.log('screenshots done');
