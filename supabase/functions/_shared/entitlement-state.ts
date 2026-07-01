/** Map a RevenueCat webhook event to the resulting premium state. */

const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);

const REVOKE_EVENTS = new Set([
  "EXPIRATION",
  "CANCELLATION",
  "BILLING_ISSUE",
]);

/**
 * Returns the premium state a RevenueCat event should produce, or `null` when
 * the event type is not relevant (caller should skip the write).
 *
 * - Grant events → premium when the pro entitlement is (or is implicitly) active.
 * - Revoke events (cancel / expire / billing issue) → always false.
 */
export function resolveEntitlementState(
  eventType: string,
  entitlementIds: string[],
  entitlementId = "pro",
): boolean | null {
  if (GRANT_EVENTS.has(eventType)) {
    return entitlementIds.length === 0 || entitlementIds.includes(entitlementId);
  }
  if (REVOKE_EVENTS.has(eventType)) {
    return false;
  }
  return null;
}
