#!/usr/bin/env node
/**
 * Set App Store subscription prices from USA base ($9.99 / $59.99),
 * then apply Apple equalizations for every territory (incl. GBR).
 *
 * Usage: node scripts/asc-set-subscription-prices.mjs [--dry-run] [--territories=GBR,USA]
 */
import { asc } from './asc-api.mjs';

const SUBS = [
  { id: '6781793893', productId: 'pro_weekly', target: 9.99 },
  { id: '6781793936', productId: 'pro_yearly', target: 59.99 },
];

const DRY_RUN = process.argv.includes('--dry-run');
const territoryArg = process.argv.find((a) => a.startsWith('--territories='));
/** If set, only these territories. Default: all equalizations from USA. */
const ONLY = territoryArg
  ? new Set(
      territoryArg
        .slice('--territories='.length)
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    )
  : null;

function startDate() {
  // ASC requires a future calendar date (not today).
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ascGet(path) {
  let r = await asc('GET', path);
  for (let i = 0; i < 5 && r.status === 429; i++) {
    await sleep(1500 * (i + 1));
    r = await asc('GET', path);
  }
  return r;
}

async function ascGetAll(firstPath) {
  const items = [];
  const included = [];
  let url = firstPath;
  while (url) {
    const path = url.startsWith('http')
      ? url.replace('https://api.appstoreconnect.apple.com', '')
      : url;
    const r = await ascGet(path);
    if (r.status !== 200) {
      throw new Error(`GET ${path} → ${r.status} ${JSON.stringify(r.json.errors ?? r.json)}`);
    }
    items.push(...(r.json.data ?? []));
    included.push(...(r.json.included ?? []));
    url = r.json.links?.next || null;
  }
  return { items, included };
}

async function findUsaPricePoint(subId, target) {
  const { items: points } = await ascGetAll(
    `/v1/subscriptions/${subId}/pricePoints?filter[territory]=USA&limit=200`,
  );
  let best = null;
  for (const item of points) {
    const p = parseFloat(item.attributes?.customerPrice);
    if (Number.isNaN(p)) continue;
    if (Math.abs(p - target) < 0.001) return item;
    if (!best || Math.abs(p - target) < Math.abs(parseFloat(best.attributes.customerPrice) - target)) {
      best = item;
    }
  }
  if (!best) throw new Error(`No USA price point near ${target} for ${subId}`);
  return best;
}

function territoryCode(point, includedById) {
  const terrRef = point.relationships?.territory?.data?.id;
  if (!terrRef) return null;
  const terr = includedById.get(terrRef);
  return String(terr?.id || terrRef).toUpperCase();
}

async function loadEqualizations(usaPointId) {
  const byTerritory = new Map();
  let url = `/v1/subscriptionPricePoints/${usaPointId}/equalizations?include=territory&limit=200`;
  while (url) {
    const path = url.startsWith('http')
      ? url.replace('https://api.appstoreconnect.apple.com', '')
      : url;
    const r = await ascGet(path);
    if (r.status !== 200) {
      throw new Error(`equalizations → ${r.status} ${JSON.stringify(r.json.errors ?? r.json)}`);
    }
    const includedById = new Map((r.json.included ?? []).map((x) => [x.id, x]));
    for (const eq of r.json.data ?? []) {
      const code = territoryCode(eq, includedById);
      if (code) byTerritory.set(code, eq);
    }
    url = r.json.links?.next || null;
  }
  return byTerritory;
}

async function setPrice(subId, pricePointId, date) {
  return asc('POST', '/v1/subscriptionPrices', {
    data: {
      type: 'subscriptionPrices',
      attributes: {
        startDate: date,
        preserveCurrentPrice: false,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subId } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: pricePointId } },
      },
    },
  });
}

async function main() {
  const date = startDate();
  console.log(
    `ASC — set subscription prices from USA base (start ${date})${DRY_RUN ? ' [dry-run]' : ''}\n`,
  );

  let failed = 0;
  for (const sub of SUBS) {
    console.log(`${sub.productId} (${sub.id}) → $${sub.target} USA + equalizations`);

    const usaPoint = await findUsaPricePoint(sub.id, sub.target);
    console.log(`  USA price point ${usaPoint.attributes.customerPrice}`);

    const byTerritory = await loadEqualizations(usaPoint.id);
    byTerritory.set('USA', usaPoint);

    if (!byTerritory.has('GBR')) {
      console.log('  GBR missing from equalizations — fetching GBR price points…');
      const { items: gbrPoints } = await ascGetAll(
        `/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=GBR&limit=200`,
      );
      const usaCustomer = parseFloat(usaPoint.attributes.customerPrice);
      let best = null;
      for (const item of gbrPoints) {
        const p = parseFloat(item.attributes?.customerPrice);
        if (Number.isNaN(p)) continue;
        const score = Math.abs(p - usaCustomer);
        if (!best || score < best.score) best = { item, score };
      }
      if (best) {
        byTerritory.set('GBR', best.item);
        console.log(`  GBR fallback price point ${best.item.attributes.customerPrice}`);
      } else {
        console.error('  ✗ Could not resolve GBR price point');
        failed += 1;
        continue;
      }
    } else {
      console.log(`  GBR equalized price ${byTerritory.get('GBR').attributes?.customerPrice}`);
    }

    let targets = [...byTerritory.entries()].filter(([code]) => !ONLY || ONLY.has(code));
    targets.sort(([a], [b]) => {
      const rank = (c) => (c === 'USA' ? 0 : c === 'GBR' ? 1 : 2);
      return rank(a) - rank(b) || a.localeCompare(b);
    });

    console.log(`  applying ${targets.length} territories…`);

    if (DRY_RUN) {
      for (const [code, point] of targets.filter(([c]) => c === 'USA' || c === 'GBR')) {
        console.log(`  ○ dry-run ${code} → ${point.attributes?.customerPrice}`);
      }
      console.log(`  ○ dry-run total ${targets.length} territories\n`);
      continue;
    }

    let ok = 0;
    let err = 0;
    for (const [code, point] of targets) {
      let r = await setPrice(sub.id, point.id, date);
      for (let i = 0; i < 5 && r.status === 429; i++) {
        await sleep(1500 * (i + 1));
        r = await setPrice(sub.id, point.id, date);
      }
      if (r.status === 201 || r.status === 200) {
        ok += 1;
        if (code === 'USA' || code === 'GBR') {
          console.log(`  ✓ ${code} → ${point.attributes?.customerPrice}`);
        }
      } else {
        const detail = r.json.errors?.[0]?.detail || JSON.stringify(r.json.errors ?? r.json);
        if (/already exists|duplicate|conflict|same price|identical/i.test(detail)) {
          ok += 1;
          if (code === 'USA' || code === 'GBR') console.log(`  ~ ${code}: ${detail}`);
        } else {
          err += 1;
          if (err <= 8 || code === 'USA' || code === 'GBR') {
            console.error(`  ✗ ${code} ${r.status}: ${detail}`);
          }
        }
      }
      await sleep(100);
    }
    console.log(`  done ${sub.productId}: ${ok} ok, ${err} failed\n`);
    if (err) failed += 1;
  }

  if (failed) {
    console.error('Finished with errors.');
    process.exit(1);
  }
  console.log('Done. StoreKit purchase sheet may take a short while to refresh.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
