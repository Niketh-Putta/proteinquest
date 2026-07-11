import { Platform } from 'react-native';

import { SITE_URL } from '@/lib/site';
import {
  checkProEntitlement,
  ensureRevenueCatReady,
  getOfferingsStatus,
  getRevenueCatPlans,
  initRevenueCat,
  isRevenueCatConfigured,
  purchasePlan,
  restorePurchases,
} from './revenuecat';
import { supabase } from './supabase';

export interface PaymentPlan {
  id: string;
  title: string;
  price: string;
  caption: string;
}

export interface PaymentProvider {
  name: string;
  isConfigured: boolean;
  /** Store products loaded from RevenueCat offerings (false = ASC/RC dashboard issue). */
  offeringsReady?: boolean;
  offeringsMessage?: string;
  plans: PaymentPlan[];
  purchase(
    planId: string,
    opts?: { userId?: string; email?: string },
  ): Promise<boolean>;
  restore?(): Promise<boolean>;
}

export const PLANS: PaymentPlan[] = [
  {
    id: 'pro_weekly',
    title: 'Weekly',
    price: '\u00A36.99/wk',
    caption: 'Flexible. Cancel anytime',
  },
  {
    id: 'pro_yearly',
    title: 'Yearly',
    price: '\u00A329.99/yr',
    caption: 'Save 92% vs weekly',
  },
];

export { FREE_DAILY_SCANS } from './paywall-gate';
export { getBillingManagementUrl } from './revenuecat';

const stripeEnabled = process.env.EXPO_PUBLIC_STRIPE_ENABLED === 'true';

const stripeProvider: PaymentProvider = {
  name: 'stripe',
  isConfigured: stripeEnabled,
  plans: PLANS,
  async purchase(planId: string, opts?: { userId?: string; email?: string }) {
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : SITE_URL;
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: {
        plan_id: planId,
        user_id: opts?.userId,
        customer_email: opts?.email,
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/`,
      },
    });
    if (error || data?.error) {
      throw new Error(data?.error ?? 'Checkout failed. Stripe may not be configured yet.');
    }
    if (Platform.OS === 'web' && data?.url) {
      window.location.href = data.url;
      return false;
    }
    throw new Error('Complete checkout in the web app.');
  },
};

const revenueCatProvider: PaymentProvider = {
  name: 'revenuecat',
  isConfigured: isRevenueCatConfigured(),
  plans: PLANS,
  async purchase(planId: string) {
    return purchasePlan(planId);
  },
  async restore() {
    return restorePurchases();
  },
};

async function loadRevenueCatPlans(): Promise<PaymentPlan[]> {
  if (!isRevenueCatConfigured()) return PLANS;
  try {
    const plans = await getRevenueCatPlans();
    return plans.map(({ id, title, price, caption }) => ({ id, title, price, caption }));
  } catch {
    return PLANS;
  }
}

/** Native provider with live store prices when RevenueCat is configured. */
export async function getNativePaymentProvider(appUserId?: string): Promise<PaymentProvider> {
  if (isRevenueCatConfigured()) {
    if (appUserId) await initRevenueCat(appUserId);
    await ensureRevenueCatReady();
    const [plans, offerings] = await Promise.all([
      loadRevenueCatPlans(),
      getOfferingsStatus(),
    ]);
    const hasLivePlans = plans.length > 0;
    const offeringsReady = offerings.ready || hasLivePlans;
    const livePlans = offeringsReady && hasLivePlans ? plans : PLANS;
    return {
      ...revenueCatProvider,
      plans: livePlans,
      offeringsReady,
      offeringsMessage: offeringsReady ? undefined : offerings.message,
    };
  }
  return stubProvider;
}

const stubProvider: PaymentProvider = {
  name: 'dev-stub',
  isConfigured: false,
  plans: PLANS,
  async purchase(_planId: string, _opts?: { userId?: string; email?: string }) {
    if (!__DEV__) {
      throw new Error(
        'Payments are not enabled in this App Store build. Install the latest TestFlight or App Store update.',
      );
    }
    return true;
  },
};

export function getPaymentProvider(): PaymentProvider {
  if (Platform.OS === 'web') {
    if (stripeEnabled) return stripeProvider;
    return stubProvider;
  }
  if (isRevenueCatConfigured()) return revenueCatProvider;
  return stubProvider;
}

/** Sync RevenueCat entitlement → local profile flag (client-side; webhooks are authoritative in prod). */
export async function syncPremiumFromRevenueCat(): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;
  return checkProEntitlement();
}
