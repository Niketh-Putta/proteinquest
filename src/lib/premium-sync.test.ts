import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolvePremiumSync } from './premium-sync.ts';

test('upgrade free -> pro: mark premium and dismiss paywall', () => {
  const r = resolvePremiumSync(false, true);
  assert.equal(r.changed, true);
  assert.equal(r.is_premium, true);
  assert.equal(r.paywall_dismissed, true);
});

test('downgrade pro -> free (cancelled/expired): clear premium and re-enable paywalls', () => {
  const r = resolvePremiumSync(true, false);
  assert.equal(r.changed, true);
  assert.equal(r.is_premium, false);
  assert.equal(r.paywall_dismissed, false);
});

test('no change while still pro: do not write', () => {
  assert.equal(resolvePremiumSync(true, true).changed, false);
});

test('no change while still free: do not write', () => {
  assert.equal(resolvePremiumSync(false, false).changed, false);
});
