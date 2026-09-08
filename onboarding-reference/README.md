# ProteinQuest onboarding implementation handoff

This directory contains the complete source and assets for demo version 21, from source commit `be0e7be1136a9738a95dbd0ed674ce3c787fbdb3`.

Preview: https://proteinquest-onboarding-study.jeevan15putta.chatgpt.site/

This is a reference delivery, not an installation into the native app. The existing Expo routes remain unchanged. The root TypeScript configuration excludes this standalone web reference.

## Contents

- `web/`: complete web prototype, dependency lockfile, screen components, styles, and supplied video assets. Run independently with `npm ci` and `npm run dev` from this directory if needed. Do not install its dependencies in the Expo root.
- `web/app/page.tsx`: all screen definitions, branching, draft restoration, result flow and sign-in entry points. This file also contains preview-only controls and a simplified DemoApp; those are NOT the real app and must not be ported.
- `web/components/intro-phone.*`: full-resolution 888 × 1920 video, half-width iPhone, curved right entrance and left exit, playback-end sequencing, reduced-motion handling. Used on welcome and final start screens.
- `web/components/reward-story.*`: two animated screens after the result page; check-card reward sequence and an illustrative comparison chart.
- `web/components/weight-ruler.tsx`, `trend-chart.tsx`, `discovery-icons.tsx`: reusable interaction and visual references.
- `web/lib/onboarding-flow.ts`, `nutrition-estimate.ts`: draft navigation, weight concern checks and nutrition estimates.
- `web/components/save-onboarding.tsx`, `email-auth.tsx`, `account-session.tsx`, `web/lib/proteinquest-auth.ts`: prototype persistence and authentication reference.
- `integration-drafts/src/`: unintegrated snapshots of earlier proposed native Profile editor, profile types, session-save protection and nutrition helper. Compare them with the current real app files; do not overwrite current files blindly. These drafts have not been tested or shipped to the native app.

## Implementation brief for the next AI

Implement this onboarding in the existing Expo/React Native ProteinQuest app. Read the current app architecture and this entire reference before changing routes. Port the approved screen design and motion using native components and the app's installed libraries. Preserve the app's existing functionality, auth setup, dragon progression, logs and subscriptions. Do not rebuild the app homepage or embed the simplified web DemoApp.

Match the actual reachable demo journey, not the dormant switch cases. The sequence includes welcome, sex, workouts, birthday, discovery, previous tracking, animated trend, height, current weight, trainer, gain/maintain/lose goal (in that order), target weight and pace when relevant, consistency, obstacles, diet, motivation, potential, thank-you, calorie rollover, notifications, promo code, plan preparation, calories/protein results, two reward-story screens, real account sign-in, and final animated start screen. Maintain skips target and pace. Use back navigation and retain answers. Keep Apple Health, exercise-calorie add-back, fabricated social proof and paywall screens removed.

Use the provided video on welcome and final start. Retain its native resolution. The phone comes from the right on a smooth curved arch, stops while the video plays, exits left after playback ends, and repeats. No visible Pause demo button. Respect reduced motion and provide a play fallback when autoplay is blocked. Keep text clear of graph paths, graph endpoint circles on the actual endpoints, and use a flat ending for the loss trend.

On results, display only calories and protein. Treat calculated targets as estimates, not guaranteed outcomes. Audit the draft calculation, validation, units and date handling before native use. Save inputs and derived targets to the real authenticated Supabase user ID, not an arbitrary email match. Resume drafts safely through OAuth and email confirmation; guard against anonymous/demo saves, cross-account draft reuse and stale overwrites. Use current RLS and existing profile APIs, with visible save failure and retry. Never move a registered user's save to a newly created guest account after an auth failure.

Add a compact expandable Goals & personal details entry near the bottom of the real Profile screen. Include relevant editable metrics and diet preferences, validation, unit conversion and recalculation. Preserve all unrelated profile/dragon data. Birthday should age correctly over time. Diet and discovery answers should not arbitrarily alter energy requirements. Prefer one canonical native calculator and data model shared by onboarding and Profile.

Use existing real Google, Apple and email authentication. Apple provider credentials were NOT verified as complete in this demo; inspect configuration rather than assuming success. Keep secrets out of app source. The demo Supabase publishable key is not a service-role key; use the app's existing environment configuration.

Try Now must route to the real existing Today/home screen with the user's dragon and saved protein/calorie goals. No paywall for this journey. Do not migrate preview screen selectors, presets, bypasses, fake purchase results, illustrative meal logging or browser-only localStorage code into production.

Do not add the unverified claim that rewarded users are 72% more likely to reach fitness goals. The comparison graph is explicitly illustrative, not measured competitor performance. Keep labels honest. Review stronger promotional wording before production release.

The owner previously requested implementation without tests. Do not claim end-to-end verification that has not happened. Report outstanding provider configuration, native behavior and data-flow risks clearly. Commit the native implementation on a separate branch for review; do not merge, release to stores or change live backend configuration without the necessary task authorization.

## Known prototype limitations to resolve

- Web preview includes unreachable legacy/paywall code and stale tests; do not assume these are requirements.
- Calculator error handling can show zero placeholders; replace with actionable validation in the real flow.
- Prototype calorie/protein fields and activity/birthday mappings must be unified with the app model; do not blindly copy browser draft fields over newer profile values.
- `retention.onboarding` is used for additional answers; review concurrent updates and data ownership when integrating. A dedicated schema change is optional only if justified and reviewed.
- The final preview homepage is intentionally incomplete; use the existing native homepage instead.
- Demo build succeeded before this source export. No native or browser end-to-end tests were performed for this handoff.
