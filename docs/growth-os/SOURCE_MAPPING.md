# Source to canonical mapping

| Source | Canonical table | Join key | Notes |
| --- | --- | --- | --- |
| App / web ingest | `analytics.events` | `event_id` | Dedupes retries |
| Same payload | `analytics.install_identities` | `install_id` | Links `user_id` after auth. Never email. |
| RevenueCat webhook | `analytics.subscription_events` | `(provider, provider_event_id)` | Production only. Sandbox excluded. |
| Apple sales / analytics | `analytics.store_daily_metrics` | platform+date+country+source | Apple definitions |
| Play install CSV | `analytics.store_daily_metrics` | same | Google definitions |
| Store financial reports | `analytics.store_financials` | period+platform+product | Accounting truth |
| `analyze-food` | `analytics.ai_usage` | `(provider, request_id)` | Estimate. Invoice is separate |
| Manual invoices | `analytics.expenses` | id | Apple membership, Play fee, Vercel, Supabase |
| Frankfurter/ECB | `analytics.fx_rates` | date+pair | GBP presentation |
| `profiles` / `protein_logs` | derived context only | user uuid | Not a substitute for store revenue |

Do not count a RevenueCat event and an Apple/Google transaction as two subscribers.
