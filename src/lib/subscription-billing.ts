import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesEntitlementInfo, Store } from 'react-native-purchases';

import {
  ensureRevenueCatReady,
  initRevenueCat,
  isRevenueCatConfigured,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_PRODUCT_IDS,
} from './revenuecat';

export type SubscriptionStatus = 'active' | 'cancelled' | 'billing_issue' | 'expired' | 'free';

export interface PurchaseHistoryEntry {
  productId: string;
  planLabel: string;
  purchaseDate: Date;
  expiresDate: Date | null;
  isActive: boolean;
  willRenew: boolean;
  cancelledAt: Date | null;
}

export interface SubscriptionBillingDetails {
  status: SubscriptionStatus;
  statusHeadline: string;
  statusDetail: string;
  planLabel: string;
  productId: string | null;
  isPro: boolean;
  accessUntil: Date | null;
  nextBillingDate: Date | null;
  lastPaymentDate: Date | null;
  cancelledAt: Date | null;
  billingIssueAt: Date | null;
  memberSince: Date | null;
  storeLabel: string;
  purchaseHistory: PurchaseHistoryEntry[];
  managementUrl: string | null;
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatBillingDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function productIdToPlanLabel(productId: string): string {
  if (productId === REVENUECAT_PRODUCT_IDS.yearly || /year|annual/i.test(productId)) {
    return 'Yearly';
  }
  if (productId === REVENUECAT_PRODUCT_IDS.weekly || /week/i.test(productId)) {
    return 'Weekly';
  }
  return 'Pro';
}

function storeToLabel(store: Store | undefined): string {
  switch (store) {
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'App Store';
    case 'PLAY_STORE':
      return 'Google Play';
    case 'STRIPE':
      return 'Stripe';
    default:
      return Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  }
}

function pickProEntitlement(info: CustomerInfo): PurchasesEntitlementInfo | null {
  const active = info.entitlements.active[REVENUECAT_ENTITLEMENT_ID];
  if (active) return active;
  const all = info.entitlements.all[REVENUECAT_ENTITLEMENT_ID];
  return all?.isActive ? all : (all ?? null);
}

function buildPurchaseHistory(info: CustomerInfo): PurchaseHistoryEntry[] {
  const entries = new Map<string, PurchaseHistoryEntry>();

  for (const [productId, sub] of Object.entries(info.subscriptionsByProductIdentifier ?? {})) {
    const purchaseDate = parseIsoDate(sub.purchaseDate);
    if (!purchaseDate) continue;
    entries.set(productId, {
      productId,
      planLabel: productIdToPlanLabel(productId),
      purchaseDate,
      expiresDate: parseIsoDate(sub.expiresDate),
      isActive: sub.isActive,
      willRenew: sub.willRenew,
      cancelledAt: parseIsoDate(sub.unsubscribeDetectedAt),
    });
  }

  for (const [productId, iso] of Object.entries(info.allPurchaseDates ?? {})) {
    if (entries.has(productId)) continue;
    const purchaseDate = parseIsoDate(iso);
    if (!purchaseDate) continue;
    entries.set(productId, {
      productId,
      planLabel: productIdToPlanLabel(productId),
      purchaseDate,
      expiresDate: parseIsoDate(info.allExpirationDates?.[productId] ?? null),
      isActive: info.activeSubscriptions.includes(productId),
      willRenew: false,
      cancelledAt: null,
    });
  }

  return [...entries.values()].sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime());
}

function buildDetails(info: CustomerInfo): SubscriptionBillingDetails {
  const entitlement = pickProEntitlement(info);
  const productId =
    entitlement?.productIdentifier ??
    info.activeSubscriptions[0] ??
    info.allPurchasedProductIdentifiers[0] ??
    null;

  const subscription = productId ? info.subscriptionsByProductIdentifier?.[productId] : undefined;
  const purchaseHistory = buildPurchaseHistory(info);

  const accessUntil =
    parseIsoDate(entitlement?.expirationDate ?? subscription?.expiresDate ?? info.latestExpirationDate) ??
    purchaseHistory.find((e) => e.isActive)?.expiresDate ??
    null;

  const cancelledAt =
    parseIsoDate(entitlement?.unsubscribeDetectedAt ?? subscription?.unsubscribeDetectedAt ?? null);
  const billingIssueAt =
    parseIsoDate(entitlement?.billingIssueDetectedAt ?? subscription?.billingIssuesDetectedAt ?? null);

  const willRenew = entitlement?.willRenew ?? subscription?.willRenew ?? false;
  const isPro = REVENUECAT_ENTITLEMENT_ID in info.entitlements.active;
  const memberSince =
    parseIsoDate(
      entitlement?.originalPurchaseDate ?? subscription?.originalPurchaseDate ?? info.originalPurchaseDate,
    ) ?? purchaseHistory.at(-1)?.purchaseDate ?? null;

  const lastPaymentDate = purchaseHistory[0]?.purchaseDate ?? null;
  const planLabel = productId ? productIdToPlanLabel(productId) : 'Pro';
  const storeLabel = storeToLabel(entitlement?.store ?? subscription?.store);

  let status: SubscriptionStatus = 'free';
  let statusHeadline = 'Free plan';
  let statusDetail = 'Upgrade to ProteinQuest Pro for unlimited AI scans.';

  if (isPro && billingIssueAt) {
    status = 'billing_issue';
    statusHeadline = 'Billing issue';
    statusDetail = accessUntil
      ? `There is a problem with your payment method. Update it in ${storeLabel} before ${formatBillingDate(accessUntil)} to keep Pro.`
      : `There is a problem with your payment method. Update it in ${storeLabel} to keep Pro.`;
  } else if (isPro && !willRenew) {
    status = 'cancelled';
    statusHeadline = 'Cancelled. Pro still active';
    statusDetail = accessUntil
      ? `Auto-renew is off. You keep unlimited scans until ${formatBillingDate(accessUntil)}, then AI scans require Pro.`
      : 'Auto-renew is off. You keep Pro until the end of your current billing period.';
  } else if (isPro) {
    status = 'active';
    statusHeadline = 'ProteinQuest Pro · active';
    statusDetail = accessUntil
      ? `Renews automatically on ${formatBillingDate(accessUntil)} unless you cancel.`
      : 'Your subscription renews automatically each billing period.';
  } else if (entitlement && !isPro) {
    status = 'expired';
    statusHeadline = 'Pro expired';
    statusDetail = accessUntil
      ? `Your Pro access ended on ${formatBillingDate(accessUntil)}. Resubscribe anytime for unlimited scans.`
      : 'Your Pro subscription has ended. Resubscribe anytime for unlimited scans.';
  }

  return {
    status,
    statusHeadline,
    statusDetail,
    planLabel,
    productId,
    isPro,
    accessUntil,
    nextBillingDate: isPro && willRenew ? accessUntil : null,
    lastPaymentDate,
    cancelledAt,
    billingIssueAt,
    memberSince,
    storeLabel,
    purchaseHistory,
    managementUrl: info.managementURL ?? null,
  };
}

const FREE_DETAILS: SubscriptionBillingDetails = {
  status: 'free',
  statusHeadline: 'Free plan',
  statusDetail: 'Upgrade to ProteinQuest Pro for unlimited AI scans.',
  planLabel: 'Free',
  productId: null,
  isPro: false,
  accessUntil: null,
  nextBillingDate: null,
  lastPaymentDate: null,
  cancelledAt: null,
  billingIssueAt: null,
  memberSince: null,
  storeLabel: Platform.OS === 'ios' ? 'App Store' : 'Google Play',
  purchaseHistory: [],
  managementUrl: null,
};

/** Load subscription status, renewal dates, and purchase history from RevenueCat. */
export async function getSubscriptionBillingDetails(
  appUserId?: string,
): Promise<SubscriptionBillingDetails> {
  if (!isRevenueCatConfigured()) return FREE_DETAILS;

  try {
    if (appUserId) await initRevenueCat(appUserId);
    await ensureRevenueCatReady();
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    return buildDetails(info);
  } catch (e) {
    console.warn('[billing] subscription details unavailable:', e);
    return FREE_DETAILS;
  }
}
