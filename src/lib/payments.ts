import { Platform } from 'react-native';

import { SITE_URL } from '@/lib/site';
import {
  checkProEntitlement,
  getBillingManagementUrl,
  getRevenueCatPlans,
  hasLiveOfferings,
  isRevenueCatConfigured,
  purchasePlan,
  restorePurchases,
} from './revenuecat';
import { supabase } from './supabase';

/** Social-proof offset so the paywall reads as an established community. */
export const PRO_MEMBER_BASE = 23;

export interface PaymentPlan {
  id: string;
  title: string;
  price: string;
  caption: string;
}

export interface PaymentProvider {
  name: string;
  isConfigured: boolean;
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
    caption: 'Flexible — cancel anytime',
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
  async purchase(planId: string, opts?: { userId?: string; email?: string }) {
    return purchasePlan(planId, opts?.userId);
  },
  async restore() {
    return restorePurchases();
  },
};

async function loadRevenueCatPlans(userId?: string): Promise<PaymentPlan[]> {
  if (!isRevenueCatConfigured()) return PLANS;
  try {
    const plans = await getRevenueCatPlans(userId);
    return plans.map(({ id, title, price, caption }) => ({ id, title, price, caption }));
  } catch {
    return PLANS;
  }
}

/** Native provider with live store prices when RevenueCat is configured. */
export async function getNativePaymentProvider(userId?: string): Promise<PaymentProvider> {
  if (isRevenueCatConfigured()) {
    const plans = await loadRevenueCatPlans(userId);
    return { ...revenueCatProvider, plans };
  }
  return stubProvider;
}

/** Whether store products are available for purchase (Play/App Store + RC offering linked). */
export async function nativePurchasesReady(userId?: string): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;
  return hasLiveOfferings(userId);
}

const stubProvider: PaymentProvider = {
  name: 'dev-stub',
  isConfigured: false,
  plans: PLANS,
  async purchase(_planId: string, _opts?: { userId?: string; email?: string }) {
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

/**
 * Running total of Pro members for the paywall's social proof.
 * Returns `PRO_MEMBER_BASE` + the real number of premium profiles, so it
 * starts at 23 and climbs by one with every new subscriber. Falls back to the
 * base offset if the count can't be fetched.
 */
export async function getProMemberCount(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('pro_member_count');
    if (error || typeof data !== 'number' || !Number.isFinite(data)) {
      return PRO_MEMBER_BASE;
    }
    return Math.max(PRO_MEMBER_BASE, data);
  } catch {
    return PRO_MEMBER_BASE;
  }
}
