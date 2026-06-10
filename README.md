# ProteinQuest

Snap a photo of your food. AI counts the protein. Hit your daily goal.

CalAI-style food tracking, ruthlessly focused on one number: **grams of protein**.

**Live web version: https://proteinquest.vercel.app**

Demo video: `demo/proteinquest-demo.mp4`

## Test it on your phone (Expo Go)

1. Install **Expo Go** from the App Store / Play Store
2. On this Mac, in this folder:

```bash
npx expo start
```

3. Make sure the phone is on the **same Wi-Fi** as the Mac
4. Scan the QR code shown in the terminal (iPhone: Camera app; Android: Expo Go app)

That's it — full app with the real camera flow.

> If the QR connection fails (strict network), run `npx expo start --tunnel` instead.

## Test it in a browser

```bash
npx expo start --web        # local
```

or just open https://proteinquest.vercel.app (deployed). Web has a full in-app
camera viewfinder (getUserMedia) plus a library upload button.

## How it works

1. **Onboarding** — age, weight, training frequency, goal → calculates your daily protein target (g/kg based, with age adjustment)
2. **Snap** — photograph your meal; a vision model identifies items, portions, and protein per item
3. **Confirm** — adjust the AI's total if you want, then log it
4. **Track** — animated progress ring for today, 7-day trends, streaks of goal hits

## Freemium

Free tier: **3 AI scans/day**. The paywall and gating are live; payments are a
stubbed provider (`src/lib/payments.ts`) ready for RevenueCat (native) or
Stripe Checkout (web). The "Unlock Pro" button currently grants premium in
test mode so you can feel the full experience.

## ⚠️ Activate OpenAI billing

The API key is configured in Supabase secrets and uses **gpt-4o**, but OpenAI
returns `billing_not_active` until you add a payment method at
[platform.openai.com](https://platform.openai.com/settings/organization/billing).
Until then, scans show a clear error — no fake demo meals.

```bash
cd ~/proteinlens && source .env
node demo/test-analyze.mjs       # verify real analysis
node demo/test-accuracy.mjs      # 7 diverse food/non-food images
```

## Auth

Anonymous Supabase session only — no sign-in UI. Sessions are created automatically on first open; see `SHIP.md`.

## Stack

| Layer | Tech |
|---|---|
| App | React Native + Expo (SDK 56), expo-router, TypeScript |
| Web deploy | Vercel (static export), https://proteinquest.vercel.app |
| Backend | Supabase `csxdkvpvcasuknhnprxp` (Postgres + RLS, anonymous auth, Storage, Edge Functions) |
| AI | OpenAI vision (`gpt-4o-mini`) via the `analyze-food` Edge Function — key stays server-side |

## Project layout

```
src/
  app/              expo-router routes
    onboarding.tsx  protein goal calculator wizard
    snap.tsx        photo -> AI analysis -> confirm -> log (modal)
    paywall.tsx     Pro upsell (3 free scans/day gate)
    (tabs)/         today (ring + log), trends (7-day chart), goal (editor)
  components/       ProgressRing, Button, form controls
  lib/              supabase client, session context, API, goal math, payments
supabase/
  migrations/       profiles, protein_logs, RLS, storage policies, is_premium
  functions/
    analyze-food/   OpenAI vision call + demo fallback
demo/
  record-demo.mjs   Playwright walkthrough recorder
  proteinquest-demo.mp4  the demo video
```

## Useful commands

```bash
npx tsc --noEmit                          # typecheck
node demo/test-analyze.mjs                # test the AI endpoint directly
node demo/record-demo.mjs                 # re-record the walkthrough video
vercel build --prod --yes && vercel deploy --prebuilt --prod --yes   # redeploy web
npx expo prebuild                         # regenerate ios/ + android/ native projects
```

See `SHIP.md` for the path to the App Store / Play Store.
