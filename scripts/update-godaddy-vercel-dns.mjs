#!/usr/bin/env node
/**
 * Update GoDaddy DNS for proteinquest.app to match Vercel's current recommended records.
 * Requires GODADDY_API_KEY + GODADDY_API_SECRET (https://developer.godaddy.com/keys).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOMAIN = 'proteinquest.app';
const APEX_IP = '216.198.79.1';
const WWW_CNAME = '9e4289fc20e89ed6.vercel-dns-017.com';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(join(process.cwd(), '.env'));
loadEnvFile(join(process.cwd(), '.env.local'));

const key = process.env.GODADDY_API_KEY?.trim();
const secret = process.env.GODADDY_API_SECRET?.trim();
if (!key || !secret) {
  console.error('Missing GODADDY_API_KEY or GODADDY_API_SECRET.');
  console.error('Create keys at https://developer.godaddy.com/keys then add to .env.local');
  process.exit(1);
}

const base = `https://api.godaddy.com/v1/domains/${DOMAIN}/records`;
const headers = {
  Authorization: `sso-key ${key}:${secret}`,
  'Content-Type': 'application/json',
};

async function getRecords(type) {
  const res = await fetch(`${base}/${type}`, { headers });
  if (!res.ok) throw new Error(`GET ${type}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function putRecords(type, records) {
  const res = await fetch(`${base}/${type}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(records),
  });
  if (!res.ok) throw new Error(`PUT ${type}: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`Updating DNS for ${DOMAIN}...`);

  const aRecords = await getRecords('A');
  const apex = aRecords.filter((r) => r.name === '@' || r.name === '');
  const otherA = aRecords.filter((r) => r.name !== '@' && r.name !== '');
  const newApex = { data: APEX_IP, name: '@', ttl: 600 };
  await putRecords('A', [...otherA, newApex]);
  console.log(`A @ → ${APEX_IP} (was ${apex.map((r) => r.data).join(', ') || 'none'})`);

  const cnameRecords = await getRecords('CNAME');
  const otherCname = cnameRecords.filter((r) => r.name !== 'www');
  const newWww = { data: WWW_CNAME, name: 'www', ttl: 3600 };
  await putRecords('CNAME', [...otherCname, newWww]);
  const oldWww = cnameRecords.find((r) => r.name === 'www');
  console.log(`CNAME www → ${WWW_CNAME} (was ${oldWww?.data ?? 'none'})`);

  console.log('Done. DNS may take 5–15 minutes to propagate.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
