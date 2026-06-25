// Minimal App Store Connect API client.
// Signs an ES256 JWT with the local ASC API key (.p8) and makes a request.
//
// Usage:
//   node scripts/asc-api.mjs GET /v1/apps
//   node scripts/asc-api.mjs POST /v1/bundleIds '{"data":{...}}'
//
// Reads key config from env (with sane defaults for this project).
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID || 'U5KW7AP443';
const ISSUER_ID = process.env.ASC_ISSUER_ID || '75ae36fa-911c-462c-818e-f1bcc4222c24';
const KEY_PATH =
  process.env.ASC_KEY_PATH || '/Users/nikethputta/proteinlens/store/AuthKey_U5KW7AP443.p8';

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 60 * 15,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  // ES256 needs the signature in IEEE P1363 (r||s) format.
  const der = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(der)}`;
}

export async function asc(method, path, body) {
  const token = makeJwt();
  const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , method, path, bodyArg] = process.argv;
  if (!method || !path) {
    console.error('Usage: node scripts/asc-api.mjs <METHOD> <PATH> [jsonBody]');
    process.exit(1);
  }
  const { status, json } = await asc(method, path, bodyArg);
  console.log(`STATUS ${status}`);
  console.log(JSON.stringify(json, null, 2));
}
