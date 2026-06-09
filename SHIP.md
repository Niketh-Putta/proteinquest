# SHIP.md — Getting ProteinLens into the App Store / Play Store

Everything that could be configured without your developer accounts is done.
This file lists exactly what remains, in order.

## Already done for you

- App identity: name **ProteinLens**, bundle id / package **com.proteinlens.app**, version 1.0.0
- App icon, splash screen, favicon (dark, lime aperture branding)
- iOS camera + photo-library permission strings; Android CAMERA permission
- `ITSAppUsesNonExemptEncryption=false` (skips the export-compliance question on every submit)
- `eas.json` with development / preview / production build profiles
- Native projects generated (`ios/`, `android/`) — the app opens in Xcode and Android Studio
  (they are gitignored; regenerate anytime with `npx expo prebuild`)
- Backend deployed and live: Supabase project `csxdkvpvcasuknhnprxp` (eu-west-2),
  schema + RLS + storage bucket + `analyze-food` Edge Function with the OpenAI key set as a server-side secret

## What only you can do

### 1. Developer accounts (one-time)
- [ ] Enroll in the **Apple Developer Program** — $99/yr — https://developer.apple.com/programs/enroll/
- [ ] Create a **Google Play Console** account — $25 one-time — https://play.google.com/console/signup

### 2. Build with EAS (free Expo account)
```bash
npm i -g eas-cli
eas login                      # create account at expo.dev if needed
eas init                       # links the project, sets projectId in app.json
eas build --platform ios       # EAS walks you through Apple certificates automatically
eas build --platform android   # generates the keystore for you
```

### 3. Submit
```bash
eas submit --platform ios      # needs your App Store Connect app (create at appstoreconnect.apple.com)
eas submit --platform android  # first Play upload must be done manually in Play Console, then this works
```

### 4. Store listings (both stores)
- [ ] Screenshots (run the app, use the simulator screenshot tool; 6.7" iPhone + 12.9" iPad sizes for iOS)
- [ ] Description — suggested one-liner: *"Snap a photo. Know your protein. Hit your goal."*
- [ ] Privacy policy URL (required by both stores — the app collects: photos you submit for analysis, anonymous account id, protein logs). A free host like GitHub Pages works.
- [ ] App Privacy questionnaire (App Store Connect) / Data safety form (Play Console):
      photos (processed, not used for tracking), health & fitness data (protein logs), no ads, no tracking.

### 5. Before charging money (the freemium step, later)
- Apple/Google require **in-app purchase** for digital subscriptions — use **RevenueCat** (not Stripe)
- Suggested gate: 3 free AI scans/day, unlimited + history on Pro (~£3.99/mo)

## Costs while testing
- Supabase: free tier covers this comfortably
- OpenAI: `gpt-4o-mini` vision at low detail ≈ $0.001 per scan — 1,000 scans ≈ $1

## Useful commands
```bash
npx expo start            # dev server (Expo Go on your phone)
npx expo run:ios          # build + run on iOS simulator
npx tsc --noEmit          # typecheck
supabase functions logs analyze-food   # see AI analysis logs/errors
```
