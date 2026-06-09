# ProteinLens

Snap a photo of your food. AI counts the protein. Hit your daily goal.

CalAI-style food tracking, ruthlessly focused on one number: **grams of protein**.

## How it works

1. **Snap** — take a photo of your meal (or pick one from your library)
2. **Analyze** — a vision model identifies each food item, estimates portions, and returns protein per item + a total you can adjust
3. **Track** — the Today screen shows an animated ring of progress toward your daily goal, plus every logged meal
4. **Goal** — your daily protein target is calculated from your age, weight, training frequency, and goal (build muscle / lose fat / maintain)

## Stack

| Layer | Tech |
|---|---|
| App | React Native + Expo (SDK 56), expo-router, TypeScript |
| Backend | Supabase (Postgres + RLS, Auth, Storage, Edge Functions) |
| AI | OpenAI vision (`gpt-4o-mini`) via the `analyze-food` Edge Function |
| Auth | Supabase anonymous sign-in (zero-friction onboarding) |

## Project layout

```
src/
  app/              expo-router routes
    index.tsx       redirect: onboarding vs tabs
    onboarding.tsx  protein goal calculator wizard
    snap.tsx        photo -> AI analysis -> confirm -> log (modal)
    (tabs)/
      today.tsx     progress ring + today's meals
      trends.tsx    7-day chart, average, goals hit
      goal.tsx      edit stats, recalculate goal
  components/       ProgressRing, Button, form controls
  lib/              supabase client, session/profile context, API, goal math
supabase/
  migrations/       schema: profiles, protein_logs, storage policies
  functions/
    analyze-food/   OpenAI vision call (key stays server-side)
```

## Running it

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone (camera flows need a real device).

`.env` contains only the public Supabase URL + publishable key (safe to commit).
The OpenAI API key lives exclusively in Supabase Edge Function secrets — never in the app bundle.

## Roadmap

- Freemium paywall via RevenueCat (e.g. 3 free scans/day, unlimited on Pro)
- Streaks + push reminders
- Barcode scanning for packaged foods
- Apple Health / Google Fit sync
