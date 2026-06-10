# SHIP.md — ProteinLens status & manual steps

## Live

| What | Where |
|------|-------|
| Web app | https://proteinlens.vercel.app |
| Supabase | `csxdkvpvcasuknhnprxp` (eu-west-2) |
| Edge functions | `analyze-food` (gpt-4o), `create-checkout`, `stripe-webhook` |
| Local dev | `npx expo start` → Expo Go or `--web` |

## What works now

- **Cal AI-style flow**: center scan button → full-screen camera (expo-camera / getUserMedia) → analyze → confirm → log
- **Premium dark UI**: Sora + JetBrains Mono, protein ring hero, itemized breakdown with per-item confidence flags
- **Gamification (Locked-style)**: Whey character evolves across 5 stages, XP, streaks, celebration on goal hit
- **Evidence-based protein goals**: g/kg from training, goal, age, sex; kg/lbs; reasoning shown in onboarding/settings
- **Freemium**: 3 free photo scans/day; paywall for unlimited
- **Auth**: Google Sign-In wired in app (`Continue with Google` on onboarding + settings). Guest/anonymous still works for zero-friction testing.
- **Payments**: Stripe Checkout edge function ready; test-mode stub active until keys are set

## Manual steps (priority order)

### 1. Activate OpenAI billing (~2 min) — **blocks real AI**

The API key is set in Supabase secrets, but OpenAI returns `billing_not_active` until you add a payment method.

```bash
# 1. Add card at https://platform.openai.com/settings/organization/billing
# 2. Verify:
cd ~/proteinlens && source .env
node demo/test-analyze.mjs          # should return real food analysis
node demo/test-accuracy.mjs         # 7 diverse images (cake, burger, curry, non-food, etc.)
```

Model: **gpt-4o** (set via `OPENAI_MODEL` secret). Change to `gpt-4o-mini` to reduce cost.

### 2. Enable Google Sign-In in Supabase (~10 min)

App code is ready. One-time dashboard setup:

1. **Google Cloud Console** (https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 Client ID (Web application)
   - Authorized redirect URIs:
     - `https://csxdkvpvcasuknhnprxp.supabase.co/auth/v1/callback`
2. **Supabase Dashboard** → Authentication → Providers → **Google**
   - Enable, paste Client ID + Client Secret
3. **Supabase** → Authentication → URL Configuration → Redirect URLs, add:
   - `https://proteinlens.vercel.app/auth/callback`
   - `http://localhost:8081/auth/callback`
   - `proteinlens://auth/callback` (native)
4. Test with `nikath13putter@gmail.com` on https://proteinlens.vercel.app → onboarding → **Continue with Google**

### 3. Stripe payments for web (~15 min)

No Stripe keys on this machine yet. When ready:

```bash
# Stripe Dashboard → Products → create monthly + yearly prices
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_PRICE_MONTHLY=price_... \
  STRIPE_PRICE_YEARLY=price_...

# Deploy webhook endpoint in Stripe Dashboard:
# URL: https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/stripe-webhook
# Event: checkout.session.completed

# Enable in app:
echo 'EXPO_PUBLIC_STRIPE_ENABLED=true' >> .env
# Redeploy Vercel
```

Until then, paywall **Unlock Pro (test mode)** grants premium locally.

### 4. Native payments (App Store / Play)

Use **RevenueCat** + `react-native-purchases`. Implement a provider in `src/lib/payments.ts` (stub is RevenueCat-ready).

### 5. App Store / Play Store

See previous SHIP notes: EAS build profiles in `eas.json`, bundle id `com.proteinlens.app`.

## Accuracy test results (latest run)

OpenAI billing inactive — all 7 test images returned a clear API error (no fake chicken/rice demo data):

| Image | Expected | Result |
|-------|----------|--------|
| Birthday cake | food | API error (billing) |
| Cheeseburger | food | API error (billing) |
| Garden salad | food | API error (billing) |
| Chicken curry | food | API error (billing) |
| Protein bar | food | API error (billing) |
| Empty plate | not food | API error (billing) |
| Keyboard | not food | API error (billing) |

After billing is active, re-run `node demo/test-accuracy.mjs` — expect real per-item breakdowns and correct `is_food=false` for non-food.

## Machine notes

- iOS Simulator needs ~9 GB runtime download (disk was tight). Expo Go on iPhone works.
- Android: `npx expo run:android` with emulator or USB device.
