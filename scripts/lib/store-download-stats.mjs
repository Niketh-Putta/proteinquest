import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const APP_SKU = 'com.proteinquest.app';

async function readAscKeySync() {
  if (process.env.ASC_KEY_P8) {
    return process.env.ASC_KEY_P8.replace(/\\n/g, '\n');
  }
  const fs = await import('node:fs');
  const path =
    process.env.ASC_KEY_PATH ||
    process.env.EXPO_ASC_API_KEY_PATH ||
    './store/AuthKey_U5KW7AP443.p8';
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function ascFetch(path) {
  const keyId = process.env.ASC_KEY_ID || process.env.EXPO_ASC_KEY_ID || 'U5KW7AP443';
  const issuerId =
    process.env.ASC_ISSUER_ID || process.env.EXPO_ASC_ISSUER_ID || '75ae36fa-911c-462c-818e-f1bcc4222c24';
  const privateKey = await readAscKeySync();
  if (!privateKey) throw new Error('Missing ASC API key (ASC_KEY_P8 or key file)');

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 60 * 15, aud: 'appstoreconnect-v1' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  const token = `${signingInput}.${b64url(signature)}`;

  const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res;
}

const APP_DOWNLOAD_TYPES = new Set(['1', '1F', '1T', '1-B', '1E', '1EP', 'F1']);

function parseSalesTsv(tsv) {
  const lines = tsv.trim().split('\n');
  if (lines.length < 2) return 0;
  const headers = lines[0].split('\t');
  const typeIdx = headers.indexOf('Product Type Identifier');
  const unitsIdx = headers.indexOf('Units');
  const skuIdx = headers.indexOf('SKU');
  const parentIdx = headers.indexOf('Parent Identifier');
  if (unitsIdx === -1) return 0;

  let units = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const type = cols[typeIdx] ?? '';
    const sku = cols[skuIdx] ?? '';
    const parent = (cols[parentIdx] ?? '').trim();
    if (parent && parent !== APP_SKU) continue;
    if (sku && sku !== APP_SKU && type.startsWith('IA')) continue;
    if (!APP_DOWNLOAD_TYPES.has(type)) continue;
    units += Number.parseFloat(cols[unitsIdx] ?? '0') || 0;
  }
  return Math.max(0, Math.round(units));
}

async function fetchAppleMonth(vendorNumber, year, month) {
  const reportDate = `${year}-${String(month).padStart(2, '0')}`;
  const q = new URLSearchParams({
    'filter[frequency]': 'MONTHLY',
    'filter[reportDate]': reportDate,
    'filter[reportSubType]': 'SUMMARY',
    'filter[reportType]': 'SALES',
    'filter[vendorNumber]': vendorNumber,
    'filter[version]': '1_0',
  });
  const res = await ascFetch(`/v1/salesReports?${q}`);
  if (res.status === 404) return 0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apple sales report ${reportDate}: ${res.status} ${text.slice(0, 200)}`);
  }
  const tsv = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
  return parseSalesTsv(tsv);
}

export async function fetchAppleDownloads() {
  const vendorNumber = process.env.APPLE_VENDOR_NUMBER?.trim();
  if (!vendorNumber) {
    return { total: null, error: 'Set APPLE_VENDOR_NUMBER on Vercel (App Store Connect → Payments)' };
  }

  const now = new Date();
  let total = 0;
  const months = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try {
      const units = await fetchAppleMonth(vendorNumber, year, month);
      if (units > 0) months.push({ year, month, units });
      total += units;
    } catch (e) {
      if (i === 0) throw e;
      break;
    }
  }

  return {
    total,
    source: 'App Store Connect sales reports (app units, last 18 months)',
    recentMonths: months.slice(0, 3),
  };
}

async function googleAccessToken(scopes) {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error_description || 'Google auth failed');
  return json.access_token;
}

function parseInstallOverviewCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const headers = lines[0].split(',').map((h) => h.trim());
  const totalIdx = headers.findIndex((h) => h === 'Total User Installs');
  if (totalIdx === -1) return null;
  let max = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const val = Number.parseInt(cols[totalIdx]?.replace(/"/g, '') ?? '0', 10);
    if (val > max) max = val;
  }
  return max || null;
}

async function discoverPlayGcsBucket(token) {
  const prefix = `stats/installs/installs_${APP_SKU}_`;
  const candidates = new Set();
  if (process.env.GOOGLE_PLAY_DEVELOPER_ID) {
    const id = process.env.GOOGLE_PLAY_DEVELOPER_ID.trim();
    candidates.add(`pubsite_prod_rev_${id}`);
    candidates.add(`pubsite_prod_rev_0${id}`);
  }
  for (const id of ['4972385690429690675', '4972385690429690676', '04972385690429690675']) {
    candidates.add(`pubsite_prod_rev_${id}`);
  }

  for (const bucket of candidates) {
    const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&maxResults=1`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (listRes.status === 200) {
      const list = await listRes.json();
      if ((list.items ?? []).length) return bucket;
    }
  }
  return null;
}

async function fetchPlayFromGcs(token, bucket) {
  const prefix = `stats/installs/installs_${APP_SKU}_`;
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&maxResults=50`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(`GCS list failed: ${listRes.status}`);
  const list = await listRes.json();
  const objects = (list.items ?? [])
    .filter((o) => o.name?.includes('_overview.csv'))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  if (!objects.length) throw new Error('No install overview CSV in bucket');

  const obj = objects[0];
  const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(obj.name)}?alt=media`;
  const csvRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!csvRes.ok) throw new Error(`GCS download failed: ${csvRes.status}`);
  const csv = await csvRes.text();
  const total = parseInstallOverviewCsv(csv);
  if (total == null) throw new Error('Could not parse install CSV');
  return { total, source: `Play Console GCS (${obj.name})` };
}

export async function fetchPlayDownloads() {
  const token = await googleAccessToken([
    'https://www.googleapis.com/auth/devstorage.read_only',
  ]);

  let bucket = process.env.GOOGLE_PLAY_GCS_BUCKET?.trim();
  if (!bucket) bucket = await discoverPlayGcsBucket(token);
  if (!bucket) {
    return {
      total: null,
      error:
        'Set GOOGLE_PLAY_GCS_BUCKET (Play Console → Download reports → copy bucket id). Accept Play Console report terms first.',
    };
  }

  const data = await fetchPlayFromGcs(token, bucket);
  return { ...data, bucket };
}

export async function fetchStoreDownloadStats() {
  const [apple, play] = await Promise.all([
    fetchAppleDownloads().catch((e) => ({ total: null, error: e.message })),
    fetchPlayDownloads().catch((e) => ({ total: null, error: e.message })),
  ]);
  return {
    updatedAt: new Date().toISOString(),
    apple,
    play,
  };
}
