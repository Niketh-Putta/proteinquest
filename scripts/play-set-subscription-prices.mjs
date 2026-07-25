#!/usr/bin/env node
/**
 * Update Google Play US base-plan prices for pro_weekly / pro_yearly.
 * Usage: node scripts/play-set-subscription-prices.mjs
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGE = 'com.proteinquest.app';
const SA_PATH = join(ROOT, 'store/google-play-service-account.json');

const TARGETS = [
  { productId: 'pro_weekly', basePlanId: 'weekly', price: '9.99' },
  { productId: 'pro_yearly', basePlanId: 'yearly', price: '59.99' },
];

function loadJson(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function money(price) {
  const [units, frac = '0'] = String(price).split('.');
  const nanos = Number((frac + '000000000').slice(0, 9));
  return { currencyCode: 'USD', units, nanos };
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
  const jwt = `${unsigned}.${sign.sign(serviceAccount.private_key, 'base64url')}`;

  const res = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
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

async function main() {
  const sa = loadJson(SA_PATH);
  const token = await getAccessToken(sa);
  console.log('Play — set US subscription prices\n');

  for (const t of TARGETS) {
    const get = await api(token, 'GET', `/subscriptions/${t.productId}`);
    if (!get.ok) {
      console.error(`✗ GET ${t.productId}`, get.status, JSON.stringify(get.json));
      continue;
    }

    const sub = get.json;
    const plans = sub.basePlans ?? [];
    const plan = plans.find((p) => p.basePlanId === t.basePlanId);
    if (!plan) {
      console.error(`✗ No base plan ${t.basePlanId} on ${t.productId}`);
      continue;
    }

    const regions = plan.regionalConfigs ?? [];
    let us = regions.find((r) => r.regionCode === 'US');
    if (!us) {
      us = { regionCode: 'US', newSubscriberAvailability: true };
      regions.push(us);
    }
    us.price = money(t.price);
    us.newSubscriberAvailability = true;
    plan.regionalConfigs = regions;

    // Keep GB if present; do not wipe other regions.
    const patch = await api(
      token,
      'PATCH',
      `/subscriptions/${encodeURIComponent(t.productId)}?updateMask=basePlans&regionsVersion.version=2022/01`,
      { packageName: PACKAGE, productId: t.productId, basePlans: plans },
    );
    if (patch.ok) {
      console.log(`✓ ${t.productId}/${t.basePlanId} US → $${t.price}`);
    } else {
      console.error(`✗ ${t.productId}`, patch.status, JSON.stringify(patch.json, null, 2));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
