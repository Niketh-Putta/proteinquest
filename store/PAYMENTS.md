# ProteinQuest — End-to-end payments (iOS, Android, Web)

Bundle / package: **`com.proteinquest.app`**

| Layer | Status in repo | Needs dashboard / secrets |
|-------|----------------|---------------------------|
| RevenueCat SDK (`react-native-purchases`) | ✅ Implemented | Public SDK keys in env |
| iOS App Store products | ✅ IDs defined | Create in App Store Connect |
| Google Play subscriptions | ✅ IDs defined | Create in Play Console |
| RevenueCat project (entitlement, offering) | ✅ Spec in `revenuecat-setup.json` | Create & link in RC dashboard |
| Client paywall + gating | ✅ Live | — |
| Supabase `profiles.is_premium` | ✅ Column + RLS | — |
| RevenueCat → Supabase webhook | ✅ Edge function | Deploy + register URL in RC |
| Stripe web checkout | ✅ Edge functions | Stripe keys + deploy webhook |
| EAS production builds | ✅ `eas.json` | Set EAS secrets for RC keys |

---

## Architecture

```mermaid
flowchart TB
  subgraph Native["iOS / Android (EAS build)"]
    App[ProteinQuest app]
    RC_SDK[react-native-purchases]
    Paywall[paywall.tsx]
    Session[SessionProvider]
    App --> Paywall
    App --> Session
    Paywall --> RC_SDK
    Session --> RC_SDK
  end

  subgraph Stores["App stores"]
    ASC[App Store Connect<br/>pro_weekly · pro_yearly]
    GP[Google Play Console<br/>pro_weekly · pro_yearly]
  end

  subgraph RC["RevenueCat"]
    Entitlement[Entitlement: pro]
    Offering[Offering: default<br/>$rc_weekly · $rc_annual]
    RC_SDK --> Entitlement
    ASC --> RC
    GP --> RC
    Offering --> Entitlement
  end

  subgraph Supabase["Supabase csxdkvpvcasuknhnprxp"]
    Profiles[(profiles.is_premium)]
    RCWh[revenuecat-webhook]
    StripeWh[stripe-webhook]
    Checkout[create-checkout]
    RCWh --> Profiles
    StripeWh --> Profiles
  end

  subgraph Web["Web (Vercel)"]
    WebApp[proteinquest.vercel.app]
    WebApp --> Checkout
    Checkout --> Stripe[Stripe Checkout]
    Stripe --> StripeWh
  end

  RC --> RCWh
  Session --> Profiles
  Paywall --> Profiles
```

**App User ID:** Supabase anonymous auth UUID — set in `initRevenueCat(userId)` so purchases, restores, and webhooks all target the same profile row.

---

## Product catalog (must match everywhere)

| Plan | Plan ID | iOS product | Android product | RC package | Price (GBP) |
|------|---------|-------------|-----------------|------------|-------------|
| Weekly | `pro_weekly` | `pro_weekly` | `pro_weekly` (base plan `weekly`) | `$rc_weekly` | £6.99/wk |
| Yearly | `pro_yearly` | `pro_yearly` | `pro_yearly` (base plan `yearly`) | `$rc_annual` | £29.99/yr |

Entitlement identifier: **`pro`**

Source of truth for IDs: [`revenuecat-setup.json`](./revenuecat-setup.json)

---

## Native purchase flow (iOS & Android)

1. **App launch** — `SessionProvider` calls `initRevenueCat(supabaseUserId)` (`src/lib/revenuecat.ts`).
2. **Paywall** — `getNativePaymentProvider()` loads live prices from RevenueCat offerings; falls back to static copy if RC unavailable (Expo Go / missing keys).
3. **Purchase** — `Purchases.purchasePackage()` → store sheet (StoreKit / Play Billing).
4. **Entitlement check** — `pro` entitlement active → `saveProfile({ is_premium: true })`.
5. **Background sync** — `subscribeToProEntitlementChanges()` keeps `is_premium` in sync on renewal, expiry, or restore.
6. **Server sync (authoritative)** — RevenueCat webhook → `revenuecat-webhook` → PATCH `profiles.is_premium`.

**Restore:** Paywall “Restore purchases” → `Purchases.restorePurchases()` → same entitlement check.

**Expo Go:** Native IAP module unavailable — app uses dev stub (`Unlock Pro (test mode)`).

---

## Web purchase flow (Stripe)

1. User opens paywall on web with `EXPO_PUBLIC_STRIPE_ENABLED=true`.
2. `create-checkout` edge function creates Stripe Checkout session (`pro_weekly` / `pro_yearly`).
3. Redirect back to `/?checkout=success` → session refreshes profile.
4. `stripe-webhook` sets `is_premium=true` on `checkout.session.completed`.

---

## Environment variables

| Variable | Platform | Where to set |
|----------|----------|--------------|
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | iOS | `.env`, EAS secrets, GitHub Actions |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Android | `.env`, EAS secrets, GitHub Actions |
| `EXPO_PUBLIC_STRIPE_ENABLED` | Web | `.env`, Vercel, GitHub Actions |
| `REVENUECAT_WEBHOOK_AUTH` | Supabase | `supabase secrets set` (optional bearer) |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_WEEKLY`, `STRIPE_PRICE_YEARLY` | Supabase | Stripe dashboard → Supabase secrets |

```bash
# Local / EAS native builds
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...

# EAS (production builds — required for real IAP)
eas secret:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_...
eas secret:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_...

# Supabase webhook
supabase functions deploy revenuecat-webhook
supabase secrets set REVENUECAT_WEBHOOK_AUTH=$(openssl rand -hex 32)
```

---

## RevenueCat dashboard checklist

1. Create project **ProteinQuest**.
2. **iOS app** — bundle `com.proteinquest.app`, App Store Connect API key or shared secret (StoreKit 2).
3. **Android app** — package `com.proteinquest.app`, upload Google Play service account JSON.
4. **Entitlement** — identifier `pro`.
5. **Products** — `pro_weekly`, `pro_yearly` linked to store product IDs above.
6. **Offering** — `default` with packages `$rc_weekly` → weekly, `$rc_annual` → yearly.
7. Copy **public** SDK keys → env vars (never commit secret keys).
8. **Integrations → Webhooks:**
   - URL: `https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization: `Bearer <REVENUECAT_WEBHOOK_AUTH>`

---

## App Store Connect checklist (iOS)

1. Subscription group: **ProteinQuest Pro**.
2. Auto-renewable subscriptions: `pro_weekly`, `pro_yearly` (prices match RC setup).
3. Paid Apps agreement + banking/tax active.
4. Sandbox tester account for TestFlight / Xcode testing.
5. App Review: paywall includes Terms of Use + Privacy Policy links (already in `paywall.tsx`).

---

## Google Play Console checklist (Android)

1. Subscriptions: `pro_weekly` (base plan `weekly`), `pro_yearly` (base plan `yearly`).
2. `com.android.vending.BILLING` permission (already in `app.json`).
3. Link Play Console to RevenueCat via service account.
4. Internal testing track → license testers for sandbox purchases.
5. Upload AAB from `eas build --platform android --profile production`.

---

## Code map

| File | Role |
|------|------|
| `src/lib/revenuecat.ts` | SDK init, offerings, purchase, restore, entitlement listener |
| `src/lib/payments.ts` | Provider abstraction (RevenueCat native / Stripe web / dev stub) |
| `src/lib/paywall-gate.ts` | Free tier: 2-day unlimited trial, then 1 free scan/day (Pro for unlimited) |
| `src/app/paywall.tsx` | UI, purchase, restore, legal copy |
| `src/lib/session.tsx` | RC init on auth, client ↔ profile sync |
| `supabase/functions/revenuecat-webhook/` | Server-side premium flag from RC events |
| `supabase/functions/create-checkout/` | Stripe Checkout for web |
| `supabase/functions/stripe-webhook/` | Stripe → `is_premium` |
| `store/revenuecat-setup.json` | Product IDs + dashboard steps |
| `store/google-play-subscriptions.json` | Play Console subscription spec + review URLs |

---

## Verification

| Test | How |
|------|-----|
| Dev stub | Expo Go → paywall → “Unlock Pro (test mode)” |
| iOS sandbox | EAS build + sandbox Apple ID → purchase weekly → Pro unlocked |
| Android sandbox | Internal test track + license tester → purchase → Pro unlocked |
| Restore | Reinstall app → Restore purchases → Pro restored |
| Webhook | RevenueCat dashboard → send test webhook → check `profiles.is_premium` |
| Expiry | Cancel sub in store → wait for RC event → `is_premium` false via webhook + listener |

---

## Production go-live (App Store build live)

When the app is on the App Store, payments work only if **all** of these are true:

| Check | Where |
|-------|--------|
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` baked into the **production EAS build** | GitHub secret → CI `eas env:create` → rebuild if missing from live build |
| Paid Apps Agreement **Active** | App Store Connect → Business |
| `pro_weekly` + `pro_yearly` **Approved** | App Store Connect → Subscriptions |
| RevenueCat iOS app + **In-App Purchase key** linked | RevenueCat dashboard |
| Offering `default` with `$rc_weekly` + `$rc_annual` → entitlement `pro` | RevenueCat dashboard |
| Webhook deployed + registered | `supabase functions deploy revenuecat-webhook` + RC Integrations |

Run: `node scripts/verify-payments-production.mjs`

**Webhook behaviour:** `CANCELLATION` (user turned off auto-renew) does **not** revoke Pro until `EXPIRATION` — subscribers keep access for the paid period.

**Server enforcement:** `analyze-food` rejects photo scans over the free daily limit (403) even if the client is modified.

---

## Current gap (manual)

Until dashboard secrets are set, native builds show **“Payments aren’t connected yet”** and use test-mode unlock. Complete the checklists above to go live.

---

## iOS: “Empty offerings” / configuration error

RevenueCat error: *None of the products registered in the RevenueCat dashboard could be fetched from App Store Connect.*

**Root cause:** StoreKit cannot load `pro_weekly` / `pro_yearly` from ASC. Code IDs are correct (`com.proteinquest.app`, entitlement `pro`, offering `default`). iOS builds bake in `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (CI syncs it to EAS production).

**Most common live blocker:** **Paid Apps Agreement** is not **Active** (status `New` or `Pending User Info`). Complete Business → banking (wait for Processing), US tax form W-8BEN, then sign Paid Apps. Until Active, StoreKit returns no prices and the paywall shows fallback £6.99/£29.99 with Subscribe disabled.

**ITMS-90062 (duplicate version):** Uploading the same `CFBundleShortVersionString` as an already-approved release fails. Bump `expo.version` in `app.json` before each new App Store binary. CI runs `node scripts/validate-ios-version.mjs --strict` to catch this pre-build.

### App Store Connect (required)

1. **Agreements** — App Store Connect → Agreements, Tax, and Banking → **Paid Apps Agreement** must be Active.
2. **Subscriptions** — Monetization → Subscriptions → group **ProteinQuest Pro**:
   - `pro_weekly` (ASC id `6781793893`) — state must be **Ready to Submit** or **Approved**
   - `pro_yearly` (ASC id `6781793936`) — same
   - Each needs: display name, description, **review screenshot**, GBP pricing propagated to all territories.
3. **Submit subscriptions with the app** — On version **1.0.5**, manually add both subscriptions to the submission in ASC (automated API attach failed in CI with `'subscription' is not a relationship on reviewSubmissionItems`).
4. **Sandbox test** — Settings → App Store → Sandbox Account; purchase in TestFlight build.

Check status: `node scripts/check-asc-review.mjs` (requires `store/AuthKey_JZ3C87NKB9.p8`).

### RevenueCat dashboard (required)

1. **iOS app** — bundle `com.proteinquest.app` (must match `app.json`).
2. **In-App Purchase API key** — App Store Connect → Users and Access → Integrations → **In-App Purchase** → generate P8 → upload to RevenueCat iOS app settings (not just the ASC API key used for builds).
3. **Products** — `pro_weekly`, `pro_yearly` linked to same App Store product IDs.
4. **Entitlement** — `pro` attached to both products.
5. **Offering** — `default` (current) with `$rc_weekly` → `pro_weekly`, `$rc_annual` → `pro_yearly`.
6. **Verify** — RevenueCat → Customers → test device → Offerings should show both packages.

### Local simulator testing

Use `store/ProteinQuest.storekit` in Xcode: Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration → select this file. Rebuild with `expo run:ios` (dev client), not Expo Go.

### After fixing ASC / RC

No code change needed if IDs unchanged. Reinstall TestFlight build or wait a few minutes for RC to sync products, then retry Subscribe.

