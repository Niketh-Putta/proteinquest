#!/usr/bin/env node
/**
 * Create Google Play subscriptions for ProteinQuest via Android Publisher API.
 * Requires: store/google-play-service-account.json + verified payments profile.
 *
 * Usage: node scripts/create-play-subscriptions.mjs
 */
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGE = 'com.proteinquest.app';
const SPEC_PATH = join(ROOT, 'store/google-play-subscriptions.json');
const SA_PATH = join(ROOT, 'store/google-play-service-account.json');

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

function subscriptionBody(sub, currency) {
  const basePlan = sub.basePlans[0];
  return {
    packageName: PACKAGE,
    productId: sub.productId,
    listings: [
      {
        languageCode: 'en-US',
        title: sub.name,
        description: sub.description,
        benefits: sub.benefits,
      },
    ],
    basePlans: [
      {
        basePlanId: basePlan.basePlanId,
        autoRenewingBasePlanType: {
          billingPeriodDuration: basePlan.billingPeriod,
          gracePeriodDuration: `P${basePlan.gracePeriodDays}D`,
          accountHoldDuration: `P${basePlan.accountHoldDays}D`,
          resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE',
          prorationMode: 'SUBSCRIPTION_PRORATION_MODE_CHARGE_ON_NEXT_BILLING_DATE',
        },
        regionalConfigs: [
          {
            regionCode: 'GB',
            newSubscriberAvailability: true,
            price: {
              currencyCode: currency,
              units: basePlan.price.split('.')[0],
              nanos: Number(basePlan.price.split('.')[1] ?? '0') * 10_000_000,
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const spec = loadJson(SPEC_PATH);
  const sa = loadJson(SA_PATH);

  console.log('ProteinQuest — create Play subscriptions\n');
  const token = await getAccessToken(sa);

  for (const sub of spec.subscriptions) {
    const list = await api(token, 'GET', `/subscriptions/${sub.productId}`);
    if (list.ok) {
      console.log(`✓ ${sub.productId} already exists`);
    } else {
      console.log(`Creating ${sub.productId}…`);
      const create = await api(
        token,
        'POST',
        `/subscriptions?productId=${encodeURIComponent(sub.productId)}&regionsVersion.version=2022/01`,
        subscriptionBody(sub, spec.currency),
      );

      if (create.ok) {
        console.log(`✓ Created ${sub.productId}`);
      } else {
        console.error(`✗ ${sub.productId} failed (${create.status}):`, JSON.stringify(create.json, null, 2));
        if (create.status === 403 || /payments profile/i.test(JSON.stringify(create.json))) {
          console.error(`
Payments profile / permission not ready.
→ Play Console → Users and permissions → revenuecat service account → enable "Manage store presence"
→ Then re-run: node scripts/create-play-subscriptions.mjs
`);
          process.exit(1);
        }
        continue;
      }
    }

    // Activate each base plan so the subscription is purchasable (created in draft by default).
    for (const basePlan of sub.basePlans) {
      const activate = await api(
        token,
        'POST',
        `/subscriptions/${encodeURIComponent(sub.productId)}/basePlans/${encodeURIComponent(basePlan.basePlanId)}:activate`,
        { packageName: PACKAGE, productId: sub.productId, basePlanId: basePlan.basePlanId },
      );
      if (activate.ok) {
        console.log(`  ✓ Activated base plan ${sub.productId}/${basePlan.basePlanId}`);
      } else if (/already active/i.test(JSON.stringify(activate.json))) {
        console.log(`  ✓ Base plan ${sub.productId}/${basePlan.basePlanId} already active`);
      } else {
        console.error(`  ✗ Activate ${sub.productId}/${basePlan.basePlanId} failed (${activate.status}):`, JSON.stringify(activate.json));
      }
    }
  }

  console.log(`
Next:
  1. RevenueCat → Android app → confirm service account linked
  2. RevenueCat → Products → import pro_weekly, pro_yearly
  3. RevenueCat → Offerings → default → $rc_weekly + $rc_annual
  4. RevenueCat → Integrations → Webhook:
     https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook
     (Bearer token: supabase secrets → REVENUECAT_WEBHOOK_AUTH)
  5. npx eas build --platform android --profile production
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
