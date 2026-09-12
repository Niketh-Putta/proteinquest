# ProteinQuest Growth OS

Private dashboard: https://proteinquest.vercel.app  
Login: email + password, 8-hour signed cookie. Expo `/admin` is a backup view of the same warehouse.

Marketing site stays at https://proteinquest.app  
Expo web stays at https://proteinlens.vercel.app

Analytics start date: **2026-09-10**. Historic app events were not invented.

## Status words

| Word | Meaning |
| --- | --- |
| implemented | Code exists |
| connected | Code can read/write a live source |
| verified | Reconciled to an official statement for a known period |
| requires owner access | Needs a secret, invoice, or console action from Niketh |

## Integrations

| Source | Status | Notes |
| --- | --- | --- |
| Supabase `proteinlens` / `csxdkvpvcasuknhnprxp` | connected | Matches released app URL |
| App event ingest | implemented / connected | Live from 2026-09-10 |
| Website `landing_viewed` / `store_link_clicked` | implemented | proteinquest.app session website ID |
| Growth OS UI | implemented | Next.js in `/dashboard`, same login contract as the live site |
| RevenueCat webhook | implemented, auth-protected, requires owner access | Live URL kept. `REVENUECAT_WEBHOOK_AUTH` is set (unauthenticated POST = 401). Dashboard destination / event list / test send not confirmed. No production `subscription_events` yet. Not verified. |
| App Store Connect analytics | connected, not verified | Official daily Downloads + Discovery/Engagement imported 2026-06-25 to 2026-09-09. Sandbox excluded. |
| App Store Sales/Trends + finance | Sales/Trends connected, finance implemented | Production vendor secret works. Live sync stored official monthly unit rows (source `app_store_connect_sales`). Finance API last HTTP 404, so `store_financials` is still empty. That is Not connected, not a reconciled 0. |
| App Store Server Notifications V2 | implemented stub, requires owner access | |
| Google Play reports | implemented importer, requires owner access | Live sync: GCS list 404 on `pubsite_prod_rev_<developer_id>`. Accept Download reports terms and grant the Play reporting service account already on Vercel. Connected only after real overview rows. |
| Google Play RTDN | implemented stub, requires owner access | Existing URL kept. Pub/Sub OIDC audience defaults to that URL. Play Console topic not configured (console was signed out). |
| OpenAI per-request estimates | implemented | gpt-4o schedule 2026-09-10. Invoice reconcile needs usage key |
| Apple membership / Play registration invoices | requires owner access | Enter real invoices. Do not assume USD 99 / USD 25 |
| Paid ads | not connected | No ASA/Meta/TikTok/Google ads account confirmed |
| Store financial reconcile | unavailable | No official statement imported |

## Required secrets (names only)

Dashboard / Vercel:

- `DASHBOARD_EMAIL`
- `DASHBOARD_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `ASC_KEY_P8`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `APPLE_VENDOR_NUMBER`
- `APPLE_APP_ID`
- `APPLE_ANALYTICS_REQUEST_ID`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_GCS_BUCKET`
- `GOOGLE_PLAY_DEVELOPER_ID`
- `GOOGLE_RTDN_AUDIENCE`
- `REVENUECAT_WEBHOOK_AUTH`
- `REVENUECAT_API_KEY`

Supabase Edge Function secrets:

- `ADMIN_PASSWORD`
- `REVENUECAT_WEBHOOK_AUTH`
- same store keys if imports run in Edge Functions

Do not put the owner password, `.p8`, or service-account JSON in git.

## Setup checklist

1. Confirm owner login on https://proteinquest.vercel.app
2. [App Store Connect API keys](https://appstoreconnect.apple.com/access/integrations/api)
3. [Play Console reporting](https://play.google.com/console) + [GCS report bucket](https://support.google.com/googleplay/android-developer/answer/6135870)
4. [RevenueCat webhooks](https://app.revenuecat.com) → `https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook`
5. [Apple Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications)
6. [Play RTDN](https://developer.android.com/google/play/billing/rtdn-reference)
7. Enter real Apple / Play / Vercel / Supabase invoices into `analytics.expenses`
8. Add staff device / test account rows to `analytics.exclusions`
9. On Connections, run **Run store / FX import** after secrets are set

## Metric formulas

See `METRIC_DEFINITIONS.md`. Default activation window 7 days, paid window 30 days, Europe/London display, UTC storage.

## Reconciliation

No Apple or Google financial period is verified in this ship. Cards show **Not connected** until official reports are imported. Do not treat dashboard zeros on store revenue as a reconciled £0 statement.
