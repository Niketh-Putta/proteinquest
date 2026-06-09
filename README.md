# ProteinLens

Snap a photo of your food. AI counts the protein. Hit your daily goal.

CalAI-style food tracking, ruthlessly focused on one number: **grams of protein**.

**Live web version: https://proteinlens.vercel.app**

Demo video: `demo/proteinlens-demo.mp4`

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

or just open https://proteinlens.vercel.app (deployed). On web, "Take a photo"
uses the file picker — the camera flow is best experienced on the phone.

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

## ⚠️ One thing to fix: the OpenAI key

The key in `~/.gradlify/gradlify.env` was **rejected by OpenAI as invalid**.
The analysis endpoint currently returns clearly-labeled **demo estimates**
(`confidence: low`, a note explaining it). To switch on real AI analysis:

```bash
# get a valid key at https://platform.openai.com/api-keys
cd ~/proteinlens
supabase secrets set OPENAI_API_KEY=sk-...your-valid-key...
```

No redeploy needed — the function picks up the new secret immediately.

## Stack

| Layer | Tech |
|---|---|
| App | React Native + Expo (SDK 56), expo-router, TypeScript |
| Web deploy | Vercel (static export), https://proteinlens.vercel.app |
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
  proteinlens-demo.mp4  the demo video
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
