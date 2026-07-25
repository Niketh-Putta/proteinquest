#!/usr/bin/env node
/** Set US subscription prices (premium skimming). Leaves GB alone. */
import { asc } from './asc-api.mjs';

const SUBS = [
  { id: '6781793893', productId: 'pro_weekly', target: 9.99 },
  { id: '6781793936', productId: 'pro_yearly', target: 59.99 },
];

const TERRITORY = 'USA';

function startDate() {
  // ASC requires a future calendar date (not today).
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function findPricePoint(subId, target) {
  let url = `/v1/subscriptions/${subId}/pricePoints?filter[territory]=${TERRITORY}&limit=200`;
  let best = null;
  while (url) {
    const path = url.startsWith('http')
      ? url.replace('https://api.appstoreconnect.apple.com', '')
      : url;
    const r = await asc('GET', path);
    if (r.status !== 200) throw new Error(`prices ${subId} ${r.status} ${JSON.stringify(r.json.errors)}`);
    for (const item of r.json.data ?? []) {
      const p = parseFloat(item.attributes?.customerPrice);
      if (Number.isNaN(p)) continue;
      if (Math.abs(p - target) < 0.001) return item;
      if (!best || Math.abs(p - target) < Math.abs(parseFloat(best.attributes.customerPrice) - target)) {
        best = item;
      }
    }
    const next = r.json.links?.next;
    url = next ? next.replace('https://api.appstoreconnect.apple.com', '') : null;
  }
  if (!best) throw new Error(`No price point near ${target} for ${subId}`);
  return best;
}

async function setPrice(subId, pricePointId) {
  return asc('POST', '/v1/subscriptionPrices', {
    data: {
      type: 'subscriptionPrices',
      attributes: {
        startDate: startDate(),
        preserveCurrentPrice: false,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subId } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: pricePointId } },
      },
    },
  });
}

for (const sub of SUBS) {
  console.log(`\n${sub.productId} (${sub.id}) → $${sub.target} ${TERRITORY} from ${startDate()}`);
  const point = await findPricePoint(sub.id, sub.target);
  console.log('  price point', point.attributes.customerPrice, point.id.slice(0, 28) + '…');
  const base = await setPrice(sub.id, point.id);
  console.log('  set price', base.status, base.json.errors?.[0]?.detail || 'ok');
}

console.log('\nDone. US prices scheduled. GB left untouched.');
