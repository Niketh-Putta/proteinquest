import { Platform } from 'react-native';

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
  plans: PaymentPlan[];
  purchase(
    planId: string,
    opts?: { userId?: string; email?: string },
  ): Promise<boolean>;
}

export const PLANS: PaymentPlan[] = [
  {
    id: 'pro_weekly',
    title: 'Weekly',
    price: '\u00A36.99/wk',
    caption: 'Flexible - cancel anytime',
  },
  {
    id: 'pro_yearly',
    title: 'Yearly',
    price: '\u00A329.99/yr',
    caption: 'Save 92% vs weekly',
  },
];

const stripeEnabled = process.env.EXPO_PUBLIC_STRIPE_ENABLED === 'true';

const stripeProvider: PaymentProvider = {
  name: 'stripe',
  isConfigured: stripeEnabled,
  plans: PLANS,
  async purchase(planId: string, opts?: { userId?: string; email?: string }) {
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://proteinquest.vercel.app';
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

const stubProvider: PaymentProvider = {
  name: 'dev-stub',
  isConfigured: false,
  plans: PLANS,
  async purchase(_planId: string, _opts?: { userId?: string; email?: string }) {
    return true;
  },
};

export function getPaymentProvider(): PaymentProvider {
  if (stripeEnabled) return stripeProvider;
  return stubProvider;
}
