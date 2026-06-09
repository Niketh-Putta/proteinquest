// Payment provider abstraction.
//
// Native (App Store / Play Store): digital subscriptions MUST use in-app
// purchases. Wire RevenueCat here (react-native-purchases) once the app has
// store listings + a RevenueCat account.
//
// Web: wire Stripe Checkout. Requires STRIPE_SECRET_KEY (server side, e.g. a
// Supabase Edge Function creating a Checkout Session) and a success webhook
// that sets profiles.is_premium = true.
//
// Neither key exists on this machine yet, so the active provider is a stub
// that unlocks premium locally for testing the gated experience.

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
  /** Returns true if the purchase succeeded and premium should be granted. */
  purchase(planId: string): Promise<boolean>;
}

export const PLANS: PaymentPlan[] = [
  {
    id: 'pro_monthly',
    title: 'Monthly',
    price: '\u00A33.99/mo',
    caption: 'Cancel anytime',
  },
  {
    id: 'pro_yearly',
    title: 'Yearly',
    price: '\u00A329.99/yr',
    caption: '2 months free',
  },
];

const stubProvider: PaymentProvider = {
  name: 'dev-stub',
  isConfigured: false,
  plans: PLANS,
  async purchase(_planId: string) {
    // No payment processor configured; grant premium for testing.
    return true;
  },
};

export function getPaymentProvider(): PaymentProvider {
  // Swap for a RevenueCat provider (native) / Stripe provider (web) when keys exist.
  return stubProvider;
}

export const FREE_DAILY_SCANS = 3;
