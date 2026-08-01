#!/usr/bin/env node
/**
 * Update Google Play base-plan prices for pro_weekly / pro_yearly.
 * Sets USD base, converts all regions (incl. GB) via Play pricing API.
 *
 * Auth: store/google-play-service-account.json or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
 * Usage: node scripts/play-set-subscription-prices.mjs [--dry-run]
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGE = 'com.proteinquest.app';
const SA_PATH = join(ROOT, 'store/google-play-service-account.json');
const REGIONS_VERSION = '2025/01';
const DRY_RUN = process.argv.includes('--dry-run');

const TARGETS = [
  { productId: 'pro_weekly', basePlanId: 'weekly', price: '9.99' },
  { productId: 'pro_yearly', basePlanId: 'yearly', price: '59.99' },
];

function loadServiceAccount() {
  if (existsSync(SA_PATH)) {
    return JSON.parse(readFileSync(SA_PATH, 'utf8'));
  }
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.error('Missing store/google-play-service-account.json or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    process.exit(1);
  }
  mkdirSync(join(ROOT, 'store'), { recursive: true });
  writeFileSync(SA_PATH, raw);
  return JSON.parse(raw);
}

function money(price, currencyCode = 'USD') {
  const [units, frac = '0'] = String(price).split('.');
  const nanos = Number((frac + '000000000').slice(0, 9));
  return { currencyCode, units: String(Number(units)), nanos };
}

function formatMoney(m) {
  if (!m) return 'missing';
  const nanos = String(m.nanos || 0).padStart(9, '0').slice(0, 2);
  return `${m.currencyCode || '?'} ${m.units || 0}.${nanos}`;
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

async function convertRegionPrices(token, usdPrice) {
  const res = await api(token, 'POST', '/pricing:convertRegionPrices', {
    price: money(usdPrice, 'USD'),
  });
  if (!res.ok) {
    throw new Error(`convertRegionPrices failed (${res.status}): ${JSON.stringify(res.json)}`);
  }
  return res.json;
}

function buildRegionalConfigs(existing, converted, usdPrice) {
  const byRegion = new Map();
  for (const r of existing ?? []) {
    byRegion.set(r.regionCode, { ...r });
  }

  const convertedMap = converted.convertedRegionPrices ?? {};
  for (const [regionCode, entry] of Object.entries(convertedMap)) {
    const price = entry.price ?? entry;
    if (!price?.currencyCode) continue;
    const prev = byRegion.get(regionCode) ?? { regionCode };
    byRegion.set(regionCode, {
      ...prev,
      regionCode,
      newSubscriberAvailability: true,
      price: {
        currencyCode: price.currencyCode,
        units: String(price.units ?? '0'),
        nanos: Number(price.nanos ?? 0),
      },
    });
  }

  // Always pin US to exact target USD (conversion may round).
  byRegion.set('US', {
    ...(byRegion.get('US') ?? {}),
    regionCode: 'US',
    newSubscriberAvailability: true,
    price: money(usdPrice, 'USD'),
  });

  // Ensure GB exists even if convert omit (should not).
  if (!byRegion.has('GB') && convertedMap.GB) {
    const price = convertedMap.GB.price ?? convertedMap.GB;
    byRegion.set('GB', {
      regionCode: 'GB',
      newSubscriberAvailability: true,
      price: {
        currencyCode: price.currencyCode,
        units: String(price.units ?? '0'),
        nanos: Number(price.nanos ?? 0),
      },
    });
  }

  return [...byRegion.values()];
}

async function main() {
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa);
  console.log(`Play — set subscription prices from USD (regionsVersion ${REGIONS_VERSION})${DRY_RUN ? ' [dry-run]' : ''}\n`);

  let failed = 0;
  for (const t of TARGETS) {
    const get = await api(token, 'GET', `/subscriptions/${encodeURIComponent(t.productId)}`);
    if (!get.ok) {
      console.error(`✗ GET ${t.productId}`, get.status, JSON.stringify(get.json));
      failed += 1;
      continue;
    }

    const sub = get.json;
    const plans = sub.basePlans ?? [];
    const plan = plans.find((p) => p.basePlanId === t.basePlanId);
    if (!plan) {
      console.error(`✗ No base plan ${t.basePlanId} on ${t.productId}`);
      failed += 1;
      continue;
    }

    const beforeUs = plan.regionalConfigs?.find((r) => r.regionCode === 'US');
    const beforeGb = plan.regionalConfigs?.find((r) => r.regionCode === 'GB');
    console.log(`  ${t.productId}/${t.basePlanId}`);
    console.log(`    before US: ${formatMoney(beforeUs?.price)}`);
    console.log(`    before GB: ${formatMoney(beforeGb?.price)}`);

    const converted = await convertRegionPrices(token, t.price);
    const regionsVersion =
      converted.regionVersion?.version || converted.regionsVersion?.version || REGIONS_VERSION;
    plan.regionalConfigs = buildRegionalConfigs(plan.regionalConfigs, converted, t.price);

    const afterUs = plan.regionalConfigs.find((r) => r.regionCode === 'US');
    const afterGb = plan.regionalConfigs.find((r) => r.regionCode === 'GB');
    console.log(`    after  US: ${formatMoney(afterUs?.price)} (target $${t.price})`);
    console.log(`    after  GB: ${formatMoney(afterGb?.price)}`);
    console.log(`    regions: ${plan.regionalConfigs.length}`);

    if (DRY_RUN) {
      console.log(`  ○ dry-run — skip PATCH\n`);
      continue;
    }

    const qs = new URLSearchParams({
      updateMask: 'basePlans',
      'regionsVersion.version': regionsVersion,
    });
    const patch = await api(
      token,
      'PATCH',
      `/subscriptions/${encodeURIComponent(t.productId)}?${qs}`,
      { packageName: PACKAGE, productId: t.productId, basePlans: plans },
    );
    if (patch.ok) {
      const gb = patch.json.basePlans
        ?.find((p) => p.basePlanId === t.basePlanId)
        ?.regionalConfigs?.find((r) => r.regionCode === 'GB');
      console.log(`✓ ${t.productId}/${t.basePlanId} updated (GB now ${formatMoney(gb?.price)})\n`);
    } else {
      console.error(`✗ ${t.productId}`, patch.status, JSON.stringify(patch.json, null, 2));
      failed += 1;
    }
  }

  if (failed) process.exit(1);
  console.log('Done. Play purchase sheet may take a few minutes to refresh.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
