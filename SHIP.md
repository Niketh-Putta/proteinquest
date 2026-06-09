# SHIP.md — ProteinLens status & next steps

## Current state (all done, nothing needed from you)

- **Live web app**: https://proteinlens.vercel.app (Vercel project `proteinlens`, account `niketh-putta`)
- **Phone testing**: `npx expo start` → scan QR with Expo Go (see README)
- **Backend live**: Supabase `csxdkvpvcasuknhnprxp` (eu-west-2) — schema, RLS, anonymous auth,
  private photo bucket, `analyze-food` Edge Function deployed
- **Freemium**: 3 free scans/day gate + paywall UI live (payments stubbed, see below)
- **Native-ready**: app icon, splash, bundle id `com.proteinlens.app`, permission strings,
  `eas.json` build profiles; `ios/` + `android/` regenerate anytime with `npx expo prebuild`
- **Quality**: TypeScript clean; end-to-end flow verified by browser automation against the
  live deployment; demo video at `demo/proteinlens-demo.mp4`

## Manual steps (in priority order)

### 1. Replace the OpenAI key (5 minutes — unlocks REAL AI analysis)
The key in `~/.gradlify/gradlify.env` is invalid (OpenAI returns 401: "Incorrect API key").
Until fixed, scans return clearly-labeled demo estimates.

```bash
cd ~/proteinlens
supabase secrets set OPENAI_API_KEY=sk-...   # from platform.openai.com/api-keys
node demo/test-analyze.mjs                    # verify: should return real analysis of the test meal
```

### 2. Payments (when you want revenue)
- **Native (App Store/Play)**: Apple/Google require in-app purchase for digital subs → use **RevenueCat**.
  Create a RevenueCat account, add `react-native-purchases`, implement a provider in `src/lib/payments.ts`.
- **Web**: Stripe Checkout. Needs `STRIPE_SECRET_KEY` (no Stripe keys found on this machine).
  Pattern: Edge Function creates a Checkout Session; webhook sets `profiles.is_premium = true`.
- Until then the paywall "Unlock Pro" is test-mode (grants premium locally).

### 3. App Store / Play Store (when ready)
- Enroll: Apple Developer ($99/yr), Google Play Console ($25 once)
- `npm i -g eas-cli && eas login && eas init`
- `eas build --platform ios` / `--platform android` (EAS handles certs/keystores)
- `eas submit` for both
- Store listings: screenshots, description, **privacy policy URL** (required), data-safety forms

### Notes / machine constraints found tonight
- **iOS Simulator**: Xcode 16.4 is installed but no iOS simulator runtime, and the disk has
  only ~7.7 GB free (runtime needs 9.13 GB). Free up space, then: `xcodebuild -downloadPlatform iOS`,
  then `npx expo run:ios`. Until then, use Expo Go on your iPhone (better anyway — real camera).
- **Android**: SDK present at `~/Library/Android/sdk`; JDK 17 installed tonight via Homebrew.
  `npx expo run:android` should work with an emulator or USB device.
- Supabase DB password is in `.env.local` (gitignored). Keep it safe.
