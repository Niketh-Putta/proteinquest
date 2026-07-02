#!/usr/bin/env node
/**
 * Upload a local AAB to Google Play production (or another track) via Android Publisher API.
 * Used by CI when GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is set but EAS auto-submit is unavailable.
 *
 * Usage:
 *   node scripts/upload-aab-to-play.mjs
 *   node scripts/upload-aab-to-play.mjs --aab store/proteinquest.aab --track production
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGE = 'com.proteinquest.app';
const DEFAULT_AAB = join(ROOT, 'store/proteinquest.aab');
const SA_PATH = join(ROOT, 'store/google-play-service-account.json');

const args = process.argv.slice(2);
const aabArg = args.find((a) => a.startsWith('--aab='));
const trackArg = args.find((a) => a.startsWith('--track='));
const aabPath = aabArg?.split('=')[1] ?? DEFAULT_AAB;
const track = trackArg?.split('=')[1] ?? 'production';

function loadJson(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function api(token, method, path, body) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function uploadBundle(token, editId, aabFile) {
  const url = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/bundles?uploadType=media`;
  const body = readFileSync(aabFile);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Bundle upload failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  if (!existsSync(aabPath)) {
    console.error(`AAB not found: ${aabPath}`);
    process.exit(1);
  }
  const sizeMb = Math.round(statSync(aabPath).size / (1024 * 1024));
  console.log(`Uploading ${aabPath} (${sizeMb} MB) to Play track "${track}"…`);

  const sa = loadJson(SA_PATH);
  const token = await getAccessToken(sa);

  const editRes = await api(token, 'POST', '/edits', {});
  if (!editRes.ok) {
    throw new Error(`Create edit failed (${editRes.status}): ${JSON.stringify(editRes.json)}`);
  }
  const editId = editRes.json.id;
  console.log(`Edit id: ${editId}`);

  const bundle = await uploadBundle(token, editId, aabPath);
  const versionCode = bundle.versionCode;
  if (!versionCode) {
    throw new Error(`Upload succeeded but no versionCode in response: ${JSON.stringify(bundle)}`);
  }
  console.log(`Uploaded bundle versionCode ${versionCode}`);

  const trackRes = await api(token, 'PUT', `/edits/${editId}/tracks/${track}`, {
    track,
    releases: [
      {
        status: 'completed',
        versionCodes: [String(versionCode)],
      },
    ],
  });
  if (!trackRes.ok) {
    throw new Error(`Assign track failed (${trackRes.status}): ${JSON.stringify(trackRes.json)}`);
  }
  console.log(`Assigned to ${track} track`);

  const commitRes = await api(token, 'POST', `/edits/${editId}:commit`, {});
  if (!commitRes.ok) {
    throw new Error(`Commit failed (${commitRes.status}): ${JSON.stringify(commitRes.json)}`);
  }

  console.log(`\n✓ Published versionCode ${versionCode} to ${track}.`);
  console.log('Play Console → Release → Production to review rollout status.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
