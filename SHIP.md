# SHIP.md — ProteinQuest status & manual steps

## Live

| What | Where |
|------|-------|
| Web app | https://proteinquest.vercel.app |
| Supabase | `csxdkvpvcasuknhnprxp` (eu-west-2) |
| Edge functions | `analyze-food` (gpt-4o), `create-checkout`, `stripe-webhook` |
| Local dev | `npx expo start` → Expo Go or `--web` |

## What works now

- **Cal AI / Locked onboarding flow**: auto anonymous session → intro walkthrough (5 screens) → dragon picker + protein goal → Today tab
- **Cal AI-style flow**: center scan button → full-screen camera (expo-camera / getUserMedia) → analyze → confirm → log
- **Premium dark UI**: warm coral accent (no green), responsive on phone/tablet/laptop, protein ring hero
- **Dragon switching**: tap any dragon on Today or Settings — instant switch, separate progress per dragon
- **Gamification (Locked-style)**: Whey character evolves across 5 stages, XP, streaks, celebration on goal hit
- **Evidence-based protein goals**: g/kg from training, goal, age, sex; kg/lbs; reasoning shown in onboarding/settings
- **Unlimited scans** for all users (no daily scan cap)
- **Auth**: Anonymous Supabase session only — no sign-in UI. Session auto-created on first open; progress stored per device/browser.
- **Intro**: `profiles.intro_completed` — shown once on first visit; existing onboarded users were backfilled to skip it.
- **Payments**: Stripe Checkout edge function ready; test-mode stub active until keys are set

## Manual steps (priority order)

### 1. AI food scanning — **working**

Server-side **Gemini 2.5 Flash** powers all users (no per-user API keys).

```bash
cd ~/proteinlens
node demo/test-analyze.mjs   # should return real food analysis
```

OpenAI is an optional fallback if you set `OPENAI_API_KEY` in Supabase secrets.

### 2. Anonymous auth — **working**

No login UI. `SessionProvider` calls `signInAnonymously()` on init when there is no stored session.

- **Route order**: `/` → auto anonymous session → `!intro_completed` → `/intro` → `!onboarded` → `/onboarding` → optional paywall → `/(tabs)/today`
- Supabase project `csxdkvpvcasuknhnprxp`: keep **anonymous sign-in enabled**
- **Session persistence**: web uses `localStorage`, native uses `AsyncStorage` — same browser/device reuses one anonymous user. A **new** `auth.users` row appears when storage is cleared, incognito/private mode is used, or demo/Playwright scripts call `signInAnonymously()` directly (`demo/test-*.mjs`, `api.ts` fallback). Admin `/admin` shows **Real users** (≥1 meal logged) as the headline metric; raw `auth.users` count inflates easily during dev.

**Do not** run `supabase config push` from this repo without fixing `config.toml` first — it would disable anonymous sign-in and overwrite `site_url`.

### 3. Supabase Auth URLs (after rebrand)

Update in [Supabase Dashboard → Auth → URL Configuration](https://supabase.com/dashboard/project/csxdkvpvcasuknhnprxp/auth/url-configuration):

| Setting | Value |
|---------|-------|
| Site URL | `https://proteinquest.vercel.app` |
| Redirect URLs | `https://proteinquest.vercel.app/**`, `proteinquest://**` (native deep links) |


### 4. Stripe payments for web (~15 min)

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

### 5. Native payments (App Store / Play)

Use **RevenueCat** + `react-native-purchases`. Implement a provider in `src/lib/payments.ts` (stub is RevenueCat-ready).

### 6. App Store / Play Store

See previous SHIP notes: EAS build profiles in `eas.json`, bundle id `com.proteinquest.app`.

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
