import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { PurchasesOffering, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

/** RevenueCat entitlement identifier — must match dashboard + store/revenuecat-setup.json */
export const REVENUECAT_ENTITLEMENT_ID = 'pro';

/** Package / plan IDs — must match App Store Connect, Play Console, and RevenueCat offerings */
export const REVENUECAT_PRODUCT_IDS = {
  weekly: 'pro_weekly',
  yearly: 'pro_yearly',
} as const;

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

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

/** Wait until RevenueCat.configure has finished (no-op if never started). */
export async function ensureRevenueCatReady(): Promise<void> {
  if (initPromise) await initPromise;
}

type RcPackage = Pick<PurchasesPackage, 'identifier' | 'packageType'> & {
  product: { identifier: string; priceString?: string };
};

function getActiveOffering(offerings: PurchasesOfferings): PurchasesOffering | null {
  if (offerings.current?.availablePackages.length) return offerings.current;
  const named = offerings.all.default ?? offerings.all['default'];
  if (named?.availablePackages.length) return named;
  return Object.values(offerings.all).find((o) => o.availablePackages.length > 0) ?? null;
}

function packageMatchesPlan(pkg: RcPackage, planId: 'weekly' | 'yearly'): boolean {
  if (planId === 'yearly') {
    return (
      pkg.product.identifier === REVENUECAT_PRODUCT_IDS.yearly ||
      pkg.packageType === 'ANNUAL' ||
      pkg.identifier === '$rc_annual' ||
      /year|annual/i.test(pkg.product.identifier) ||
      /year|annual/i.test(pkg.identifier)
    );
  }
  return (
    pkg.product.identifier === REVENUECAT_PRODUCT_IDS.weekly ||
    pkg.packageType === 'WEEKLY' ||
    pkg.identifier === '$rc_weekly' ||
    /week/i.test(pkg.product.identifier) ||
    /week/i.test(pkg.identifier)
  );
}

function offeringHasPurchasablePackages(offering: PurchasesOffering | null): boolean {
  if (!offering?.availablePackages.length) return false;
  return offering.availablePackages.some((p) => {
    const id = p.product.identifier;
    return (
      id === REVENUECAT_PRODUCT_IDS.weekly ||
      id === REVENUECAT_PRODUCT_IDS.yearly ||
      /week|year|annual|month/i.test(id) ||
      !!p.product.priceString
    );
  });
}

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

export interface RevenueCatPlan {
  id: string;
  title: string;
  price: string;
  caption: string;
  packageIdentifier: string;
}

/** True when RevenueCat returns a current offering with at least one weekly/yearly package. */
export async function hasLiveOfferings(appUserId?: string): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;
  try {
    if (appUserId) await initRevenueCat(appUserId);
    await ensureRevenueCatReady();
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    return offeringHasPurchasablePackages(getActiveOffering(offerings));
  } catch (e) {
    console.warn('[RevenueCat] hasLiveOfferings failed:', e);
    return false;
  }
}

/** Fetch current offering packages mapped to our plan IDs. Falls back to static copy if unavailable. */
export async function getRevenueCatPlans(appUserId?: string): Promise<RevenueCatPlan[]> {
  const fallback: RevenueCatPlan[] = [
    {
      id: REVENUECAT_PRODUCT_IDS.weekly,
      title: 'Weekly',
      price: '\u00A36.99/wk',
      caption: 'Flexible — cancel anytime',
      packageIdentifier: '$rc_weekly',
    },
    {
      id: REVENUECAT_PRODUCT_IDS.yearly,
      title: 'Yearly',
      price: '\u00A329.99/yr',
      caption: 'Save 92% vs weekly',
      packageIdentifier: '$rc_annual',
    },
  ];

  if (!isRevenueCatConfigured()) return fallback;

  try {
    if (appUserId) await initRevenueCat(appUserId);
    await ensureRevenueCatReady();
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    const current = getActiveOffering(offerings);
    if (!current) return fallback;

    const mapped: RevenueCatPlan[] = [];
    for (const pkg of current.availablePackages) {
      const productId = pkg.product.identifier;
      const isYearly = packageMatchesPlan(pkg, 'yearly');
      const isWeekly = packageMatchesPlan(pkg, 'weekly');

      if (!isYearly && !isWeekly) continue;

      mapped.push({
        id: isYearly ? REVENUECAT_PRODUCT_IDS.yearly : REVENUECAT_PRODUCT_IDS.weekly,
        title: isYearly ? 'Yearly' : 'Weekly',
        price: pkg.product.priceString ?? (isYearly ? '\u00A329.99/yr' : '\u00A36.99/wk'),
        caption: isYearly ? 'Save 92% vs weekly' : 'Flexible — cancel anytime',
        packageIdentifier: pkg.identifier,
      });
    }

    if (mapped.length === 0) return fallback;
    return mapped.sort((a, b) => (a.id === REVENUECAT_PRODUCT_IDS.yearly ? 1 : -1));
  } catch (e) {
    console.warn('[RevenueCat] getOfferings failed:', e);
    return fallback;
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
export async function purchasePlan(planId: string, appUserId?: string): Promise<boolean> {
  if (!isRevenueCatConfigured()) {
    throw new Error('RevenueCat is not configured. Set EXPO_PUBLIC_REVENUECAT_* keys.');
  }

  if (appUserId) await initRevenueCat(appUserId);
  await ensureRevenueCatReady();

  const Purchases = (await import('react-native-purchases')).default;
  const offerings = await Purchases.getOfferings();
  const current = getActiveOffering(offerings);
  if (!current) throw new Error('No subscription offerings available yet.');

  const isYearly = planId === REVENUECAT_PRODUCT_IDS.yearly;
  const pkg = current.availablePackages.find((p) =>
    packageMatchesPlan(p, isYearly ? 'yearly' : 'weekly'),
  );

  if (!pkg) throw new Error('Selected plan is not available in the store yet.');

  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return hasProEntitlement(customerInfo);
}

/** Restore previous App Store / Play Store purchases. Returns true when Pro is active. */
export async function restorePurchases(): Promise<boolean> {
  if (!isRevenueCatConfigured()) {
    throw new Error('RevenueCat is not configured.');
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
  const storeFallback =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

  if (!isRevenueCatConfigured()) return storeFallback;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    return info.managementURL ?? storeFallback;
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
