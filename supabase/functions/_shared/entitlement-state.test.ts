import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveEntitlementState } from './entitlement-state.ts';

test('initial purchase grants pro', () => {
  assert.equal(resolveEntitlementState('INITIAL_PURCHASE', ['pro']), true);
});

test('renewal grants pro', () => {
  assert.equal(resolveEntitlementState('RENEWAL', ['pro']), true);
});

test('cancellation revokes pro', () => {
  assert.equal(resolveEntitlementState('CANCELLATION', ['pro']), false);
});

test('expiration revokes pro', () => {
  assert.equal(resolveEntitlementState('EXPIRATION', []), false);
});

test('billing issue revokes pro', () => {
  assert.equal(resolveEntitlementState('BILLING_ISSUE', ['pro']), false);
});

test('uncancellation restores pro', () => {
  assert.equal(resolveEntitlementState('UNCANCELLATION', ['pro']), true);
});

test('grant with no entitlement ids assumes pro (implicit)', () => {
  assert.equal(resolveEntitlementState('INITIAL_PURCHASE', []), true);
});

test('grant for a different entitlement does not grant pro', () => {
  assert.equal(resolveEntitlementState('INITIAL_PURCHASE', ['some_other']), false);
});

test('irrelevant event type is skipped (null)', () => {
  assert.equal(resolveEntitlementState('TEST', ['pro']), null);
  assert.equal(resolveEntitlementState('TRANSFER', ['pro']), null);
});
