import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** RevenueCat entitlement identifier — must match dashboard + store/revenuecat-setup.json */
export const REVENUECAT_ENTITLEMENT_ID = 'pro';

/** Package / plan IDs — must match App Store Connect, Play Console, and RevenueCat offerings */
export const REVENUECAT_PRODUCT_IDS = {
  weekly: 'pro_weekly',
  yearly: 'pro_yearly',
} as const;

const extra = Constants.expoConfig?.extra as
  | { revenueCatIosKey?: string; revenueCatAndroidKey?: string }
  | undefined;

const IOS_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? extra?.revenueCatIosKey ?? '';
const ANDROID_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? extra?.revenueCatAndroidKey ?? '';

/** Expo Go has no react-native-purchases native module — treat as unconfigured. */
const IS_EXPO_GO =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

function isPlaceholderKey(key: string): boolean {
  return /your[_-]/i.test(key);
}

function getApiKey(): string | null {
  const key = Platform.OS === 'ios' ? IOS_KEY : Platform.OS === 'android' ? ANDROID_KEY : '';
  if (!key || isPlaceholderKey(key)) return null;
  return key;
}

export function isRevenueCatConfigured(): boolean {
  return Platform.OS !== 'web' && !IS_EXPO_GO && !!getApiKey();
}

let initPromise: Promise<void> | null = null;

/** Configure RevenueCat once per app session. Safe to call multiple times. */
export async function initRevenueCat(appUserId: string): Promise<void> {
  if (!isRevenueCatConfigured()) return;

  if (initPromise) {
    await initPromise;
    if (appUserId) {
      const Purchases = (await import('react-native-purchases')).default;
      await Purchases.logIn(appUserId);
    }
    return;
  }

  initPromise = (async () => {
    const Purchases = (await import('react-native-purchases')).default;
    Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN);
    await Purchases.configure({ apiKey: getApiKey()!, appUserID: appUserId });
  })();

  await initPromise;
}

/** Wait until RevenueCat.configure has finished (no-op if never started). */
export async function ensureRevenueCatReady(): Promise<void> {
  if (initPromise) await initPromise;
}

export interface RevenueCatPlan {
  id: string;
  title: string;
  price: string;
  caption: string;
  packageIdentifier: string;
}

type PurchasesOfferingLike = {
  identifier: string;
  availablePackages: Array<{
    product: { identifier: string; priceString?: string };
    packageType: string;
    identifier: string;
  }>;
};

type PurchasesOfferingsLike = {
  current: PurchasesOfferingLike | null;
  all?: Record<string, PurchasesOfferingLike>;
};

function resolveCurrentOffering(offerings: PurchasesOfferingsLike): PurchasesOfferingLike | null {
  return (
    offerings.current ??
    offerings.all?.default ??
    Object.values(offerings.all ?? {}).find((o) => o.identifier === 'default') ??
    Object.values(offerings.all ?? {})[0] ??
    null
  );
}

function productMatchesPlan(productId: string, plan: 'weekly' | 'yearly'): boolean {
  const target = REVENUECAT_PRODUCT_IDS[plan];
  return productId === target || productId.startsWith(`${target}:`);
}

function isWeeklyOrYearlyPackage(p: {
  product: { identifier: string; priceString?: string };
  packageType: string;
  identifier: string;
}): boolean {
  const id = p.product.identifier;
  return (
    productMatchesPlan(id, 'weekly') ||
    productMatchesPlan(id, 'yearly') ||
    p.packageType === 'WEEKLY' ||
    p.packageType === 'ANNUAL' ||
    p.packageType === 'MONTHLY' ||
    p.identifier === '$rc_weekly' ||
    p.identifier === '$rc_annual'
  );
}

/** Package is purchasable only when StoreKit/Play returned a real price. */
function isPurchasablePackage(p: {
  product: { identifier: string; priceString?: string };
  packageType: string;
  identifier: string;
}): boolean {
  return isWeeklyOrYearlyPackage(p) && !!p.product.priceString?.trim();
}

async function fetchOfferingsWithRetry(): Promise<PurchasesOfferingsLike> {
  const Purchases = (await import('react-native-purchases')).default;
  const load = async () => {
    try {
      return (await Purchases.syncAttributesAndOfferingsIfNeeded()) as PurchasesOfferingsLike;
    } catch {
      return (await Purchases.getOfferings()) as PurchasesOfferingsLike;
    }
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const offerings = await load();
    if (resolveCurrentOffering(offerings)?.availablePackages?.some(isPurchasablePackage)) {
      return offerings;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return load();
}

export interface OfferingsStatus {
  ready: boolean;
  /** User-facing hint when offerings are empty (ASC / RevenueCat dashboard issue). */
  message?: string;
}

/** User-facing only — keep dashboard / key details in logs (App Review 2.1). */
function offeringsUnavailableMessage(): string {
  if (!getApiKey()) {
    console.warn('[RevenueCat] API key missing in this build');
    return 'Subscriptions are temporarily unavailable in this install. Try Restore Purchases, or update to the latest App Store build.';
  }
  if (Platform.OS === 'android') {
    console.warn('[RevenueCat] Android offerings empty — check Play Console products + RC offering links');
  } else {
    console.warn('[RevenueCat] iOS offerings empty — check ASC products + RC offering links');
  }
  return 'Subscriptions are temporarily unavailable. Try Restore Purchases, or try again in a few minutes.';
}

function offeringsConfigurationError(e: unknown): string | null {
  const message = e instanceof Error ? e.message : String(e);
  if (/configuration|could not be fetched|offerings empty|why-are-offerings-empty/i.test(message)) {
    return offeringsUnavailableMessage();
  }
  return null;
}

/** True when RevenueCat returns a current offering with at least one weekly/yearly package. */
export async function hasLiveOfferings(): Promise<boolean> {
  const status = await getOfferingsStatus();
  return status.ready;
}

/** Whether store products are reachable via RevenueCat (distinct from SDK key being set). */
export async function getOfferingsStatus(): Promise<OfferingsStatus> {
  if (!isRevenueCatConfigured()) {
    console.warn('[RevenueCat] not configured in this build');
    return {
      ready: false,
      message:
        'Subscriptions are temporarily unavailable in this install. Try Restore Purchases, or update to the latest App Store build.',
    };
  }
  try {
    await ensureRevenueCatReady();
    const offerings = await fetchOfferingsWithRetry();
    const current = resolveCurrentOffering(offerings);
    const packages = current?.availablePackages ?? [];
    const hasPlans = packages.some(isPurchasablePackage);
    if (hasPlans) return { ready: true };
    return { ready: false, message: offeringsUnavailableMessage() };
  } catch (e) {
    console.warn('[RevenueCat] getOfferings failed:', e);
    return {
      ready: false,
      message: offeringsConfigurationError(e) ?? offeringsUnavailableMessage(),
    };
  }
}

/** Fetch current offering packages mapped to our plan IDs. Static copy only when RC is unconfigured. */
export async function getRevenueCatPlans(): Promise<RevenueCatPlan[]> {
  const fallback: RevenueCatPlan[] = [
    {
      id: REVENUECAT_PRODUCT_IDS.weekly,
      title: 'Weekly',
      price: '$9.99/wk',
      caption: 'Full Pro access. Cancel anytime.',
      packageIdentifier: '$rc_weekly',
    },
    {
      id: REVENUECAT_PRODUCT_IDS.yearly,
      title: 'Yearly',
      price: '$4.99/mo',
      caption: 'Billed as $59.99 annually',
      packageIdentifier: '$rc_annual',
    },
  ];

  if (!isRevenueCatConfigured()) return fallback;

  try {
    await ensureRevenueCatReady();
    const offerings = await fetchOfferingsWithRetry();
    const current = resolveCurrentOffering(offerings);
    if (!current) return [];

    const mapped: RevenueCatPlan[] = [];
    for (const pkg of current.availablePackages) {
      const productId = pkg.product.identifier;
      const isYearly =
        productMatchesPlan(productId, 'yearly') ||
        pkg.packageType === 'ANNUAL' ||
        pkg.identifier === '$rc_annual';
      const isWeekly =
        productMatchesPlan(productId, 'weekly') ||
        pkg.packageType === 'WEEKLY' ||
        pkg.identifier === '$rc_weekly';

      if (!isYearly && !isWeekly) continue;
      if (!pkg.product.priceString?.trim()) continue;

      // Marketing UI copy in USD; Apple/Google still show localized store price at purchase.
      mapped.push({
        id: isYearly ? REVENUECAT_PRODUCT_IDS.yearly : REVENUECAT_PRODUCT_IDS.weekly,
        title: isYearly ? 'Yearly' : 'Weekly',
        price: isYearly ? '$4.99/mo' : '$9.99/wk',
        caption: isYearly
          ? 'Billed as $59.99 annually'
          : 'Full Pro access. Cancel anytime.',
        packageIdentifier: pkg.identifier,
      });
    }

    if (mapped.length === 0) return [];
    return mapped.sort((a, b) => (a.id === REVENUECAT_PRODUCT_IDS.yearly ? 1 : -1));
  } catch (e) {
    console.warn('[RevenueCat] getOfferings failed:', e);
    return [];
  }
}

function hasProEntitlement(customerInfo: { entitlements: { active: Record<string, unknown> } }): boolean {
  return REVENUECAT_ENTITLEMENT_ID in customerInfo.entitlements.active;
}

/** Check whether the current user has an active Pro entitlement. */
export async function checkProEntitlement(): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    return hasProEntitlement(info);
  } catch {
    return false;
  }
}

/** Purchase a plan by our plan ID (pro_weekly | pro_yearly). Returns true when Pro is active. */
export async function purchasePlan(planId: string): Promise<boolean> {
  if (!isRevenueCatConfigured()) {
    console.warn('[RevenueCat] purchasePlan: not configured');
    throw new Error(
      'Subscriptions are temporarily unavailable in this install. Try Restore Purchases, or update to the latest App Store build.',
    );
  }

  const status = await getOfferingsStatus();
  if (!status.ready) {
    throw new Error(status.message ?? offeringsUnavailableMessage());
  }

  await ensureRevenueCatReady();
  const Purchases = (await import('react-native-purchases')).default;
  const offerings = await fetchOfferingsWithRetry();
  const current = resolveCurrentOffering(offerings);
  const packages = (current?.availablePackages ?? []).filter(isPurchasablePackage);
  if (packages.length === 0) {
    throw new Error(offeringsUnavailableMessage());
  }

  const matchesPlan = (p: (typeof packages)[number]) => {
    if (planId === REVENUECAT_PRODUCT_IDS.yearly) {
      return (
        productMatchesPlan(p.product.identifier, 'yearly') ||
        p.packageType === 'ANNUAL' ||
        p.identifier === '$rc_annual'
      );
    }
    return (
      productMatchesPlan(p.product.identifier, 'weekly') ||
      p.packageType === 'WEEKLY' ||
      p.identifier === '$rc_weekly'
    );
  };

  // Prefer the selected plan; fall back to any available package so the
  // Subscribe button always drives a real store purchase sheet.
  const pkg = packages.find(matchesPlan) ?? packages[0]!;

  try {
    // `pkg` is our structural shim; the SDK wants its full PurchasesPackage.
    const { customerInfo } = await Purchases.purchasePackage(
      pkg as unknown as Parameters<typeof Purchases.purchasePackage>[0],
    );
    return hasProEntitlement(customerInfo);
  } catch (e) {
    const configMsg = offeringsConfigurationError(e);
    if (configMsg) throw new Error(configMsg);
    throw e;
  }
}

/** Restore previous App Store / Play Store purchases. Returns true when Pro is active. */
export async function restorePurchases(): Promise<boolean> {
  if (!isRevenueCatConfigured()) {
    console.warn('[RevenueCat] restorePurchases: not configured');
    throw new Error(
      'Subscriptions are temporarily unavailable in this install. Update to the latest App Store build and try again.',
    );
  }
  const Purchases = (await import('react-native-purchases')).default;
  const info = await Purchases.restorePurchases();
  return hasProEntitlement(info);
}

/**
 * Where the user manages payment method / cancellation for their subscription.
 * Prefers RevenueCat's per-user management URL; otherwise falls back to the
 * platform's store subscription page. Billing changes (card, cancel) are owned
 * by the store, so we always route there rather than handling them in-app.
 */
export async function getBillingManagementUrl(): Promise<string> {
  // Package-scoped Play link lands on this app's subscriptions (cancel / payment).
  const storeFallback =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions?package=com.proteinquest.app';

  if (!isRevenueCatConfigured()) return storeFallback;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    if (info.managementURL) return info.managementURL;

    if (Platform.OS === 'android') {
      const productId =
        info.activeSubscriptions[0] ??
        Object.keys(info.subscriptionsByProductIdentifier ?? {})[0];
      if (productId) {
        return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=com.proteinquest.app`;
      }
    }
    return storeFallback;
  } catch {
    return storeFallback;
  }
}

/** Subscribe to entitlement changes (renewal, expiry, restore). Returns unsubscribe fn. */
export function subscribeToProEntitlementChanges(
  onChange: (isPro: boolean) => void,
): () => void {
  if (!isRevenueCatConfigured()) return () => {};

  let PurchasesModule: typeof import('react-native-purchases').default | null = null;
  const listener = (info: { entitlements: { active: Record<string, unknown> } }) => {
    onChange(hasProEntitlement(info));
  };

  void (async () => {
    try {
      PurchasesModule = (await import('react-native-purchases')).default;
      PurchasesModule.addCustomerInfoUpdateListener(listener);
    } catch (e) {
      console.warn('[RevenueCat] entitlement listener skipped:', e);
    }
  })();

  return () => {
    if (PurchasesModule) PurchasesModule.removeCustomerInfoUpdateListener(listener);
  };
}
