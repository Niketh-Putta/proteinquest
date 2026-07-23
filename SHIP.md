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
- **Freemium scans**: 2-day unlimited habit trial, then 0 free AI scans/day (hard paywall; Pro = unlimited)
- **Auth**: Anonymous Supabase session only — no sign-in UI. Session auto-created on first open; progress stored per device/browser.
- **Intro**: `profiles.intro_completed` — shown once on first visit; existing onboarded users were backfilled to skip it.
- **Payments**: Stripe Checkout edge function ready; test-mode stub active until keys are set

## Status (2026-06-11)

| Track | Status |
|-------|--------|
| Web | Live at https://proteinquest.vercel.app — redeploy with `npm run deploy:prod` after code changes |
| AI scanning | OpenAI gpt-4o primary on Supabase edge function; Gemini fallback (verify: `node demo/test-analyze.mjs`) |
| Android EAS build | Production build `a6331091` **FINISHED** today — download with `npx eas build:download --platform android --latest` |
| iOS EAS build | Not confirmed finished — run `npx eas build --platform ios --profile production` |
| Play Store listing | Copy in `store/play-store-listing.json`; 5 screenshots + feature graphic ready |
| App Store listing | Copy in `store/app-store-listing.json`; `eas.json` submit IDs still placeholders |
| RevenueCat / IAP | Code complete — **no SDK keys in `.env` yet**; spec in `store/google-play-subscriptions.json` |
| One-command ship | `npm run ship:all` · Play submit: `npm run play-store:submit` |

**Blockers for store review:** RevenueCat dashboard + store subscriptions, Google Play service account JSON, App Store Connect app + `eas.json` Apple IDs.

## Manual steps (priority order)

### 1. AI food scanning — **working**

Server-side **OpenAI gpt-4o** powers scans (no per-user API keys). Gemini is the fallback if OpenAI fails.

```bash
cd ~/proteinlens
node demo/test-analyze.mjs   # should return real food analysis
```

Set `OPENAI_API_KEY` in Supabase secrets (required for gpt-4o primary). Optional: `OPENAI_MODEL` (default `gpt-4o`), `OPENAI_IMAGE_DETAIL` (`auto` cheap/fast default; `high` for max OCR), `OPENAI_MAX_TOKENS` (default 900), `GEMINI_API_KEY` for fallback.

**Blocker:** if OpenAI returns `billing_not_active`, scans seamlessly fall back to Gemini (circuit skips OpenAI for 10m per isolate). Enable billing at https://platform.openai.com/settings/organization/billing so primary gpt-4o actually runs.

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

### 5. Native payments (App Store / Play) — **code complete, dashboard pending**

RevenueCat + `react-native-purchases` is wired end-to-end in the app. Full schematic: [`store/PAYMENTS.md`](store/PAYMENTS.md).

**Still manual:**
1. Create `pro_weekly` / `pro_yearly` in App Store Connect + Google Play (see `store/revenuecat-setup.json`).
2. Configure RevenueCat project (entitlement `pro`, offering `default`, link both stores).
3. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` + `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` in EAS secrets and `.env`.
4. Deploy webhook: `supabase functions deploy revenuecat-webhook` and register URL in RevenueCat.
5. EAS production build (`npm run build:all`) — Expo Go cannot run real IAP.

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
