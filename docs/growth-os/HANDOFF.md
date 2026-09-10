# ProteinQuest Growth OS

Private dashboard: https://proteinquest.vercel.app/admin  
Marketing site is unchanged at https://proteinquest.app

Analytics start date: **2026-09-10**. Historic app events were not invented.

## Status words

| Word | Meaning |
| --- | --- |
| implemented | Code exists and is deployed |
| connected | Code can read/write a live source |
| verified | Reconciled to an official statement for a known period |
| requires owner access | Needs a secret, invoice, or console action from Niketh |

## Integrations

| Source | Status | Notes |
| --- | --- | --- |
| Supabase `proteinlens` / `csxdkvpvcasuknhnprxp` | connected | Matches released app URL |
| App event ingest | implemented / connected | Live from 2026-09-10 |
| Website `landing_viewed` / `store_link_clicked` | implemented | proteinquest.app, session website ID |
| RevenueCat webhook | implemented, requires owner access | Writes subscription events when the existing webhook fires. Confirm dest + auth in RC. |
| App Store Connect | requires owner access | Importer ready. Needs `.p8`, issuer, vendor number in Supabase secrets |
| App Store Server Notifications V2 | requires owner access | |
| Google Play reports / RTDN | requires owner access | |
| OpenAI per-request estimates | implemented | gpt-4o schedule 2026-09-10. Invoice reconcile needs usage key |
| Apple membership / Play registration invoices | requires owner access | Real invoice amounts only. USD 99 / USD 25 are not assumed |
| Paid ads | not connected | No active ASA/Meta/TikTok/Google ads account confirmed |
| Store financial reconcile | unavailable | No official statement imported |

## Required secrets (names only)

Supabase Edge Function secrets:

- `ADMIN_PASSWORD` (already used)
- `REVENUECAT_WEBHOOK_AUTH`
- `ASC_KEY_P8`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `APPLE_VENDOR_NUMBER`
- `APPLE_APP_ID` (numeric, 6781790996)
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_GCS_BUCKET`
- `GOOGLE_PLAY_DEVELOPER_ID`
- `OPENAI_USAGE_ADMIN_KEY` (optional, invoice reconcile)

Do not put the owner password, `.p8`, or service-account JSON in git.

## Setup checklist

1. Confirm admin login on https://proteinquest.vercel.app/admin
2. [App Store Connect API keys](https://appstoreconnect.apple.com/access/integrations/api) - App Manager or Sales + Finance reports
3. [Play Console reporting](https://play.google.com/console) + [GCS report bucket](https://support.google.com/googleplay/android-developer/answer/6135870)
4. [RevenueCat webhooks](https://app.revenuecat.com) → `https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook`
5. [Apple Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications)
6. [Play RTDN](https://developer.android.com/google/play/billing/rtdn-reference)
7. Enter real Apple / Play / Vercel / Supabase invoices into `analytics.expenses`
8. Add staff device / test account rows to `analytics.exclusions`

## Metric formulas

See `METRIC_DEFINITIONS.md`. Default activation window 7 days, paid window 30 days, Europe/London display, UTC storage.

## Reconciliation

No Apple or Google financial period is verified in this ship. Cards show **Not connected** until official reports are imported. Do not treat dashboard zeros on store revenue as a reconciled £0 statement.
