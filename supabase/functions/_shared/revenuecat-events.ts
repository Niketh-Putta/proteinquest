/** RevenueCat event rules for Growth OS. Sandbox and TEST never enter production totals. */

export const NEW_PAID_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
]);

export function rcEnvironment(raw: unknown): "sandbox" | "production" {
  return String(raw ?? "PRODUCTION").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function isRcTestEvent(eventType: string): boolean {
  return eventType.trim().toUpperCase() === "TEST";
}

export function shouldWriteSubscriptionEvent(eventType: string, environment: string): boolean {
  return environment === "production" && !isRcTestEvent(eventType);
}

export function shouldUpdatePremium(eventType: string, environment: string): boolean {
  return shouldWriteSubscriptionEvent(eventType, environment);
}

export function isNewPaidSubscriptionEvent(input: {
  eventType: string;
  environment?: string | null;
  isTrial?: boolean | null;
}): boolean {
  if (input.environment !== "production") return false;
  if (input.isTrial) return false;
  if (isRcTestEvent(input.eventType)) return false;
  return NEW_PAID_EVENT_TYPES.has(input.eventType.trim().toUpperCase());
}
