# Event dictionary

Schema version 1. All times UTC. `received_at` is set by the server.

Required on every event:

- `event_id` uuid (client, unique, retry-safe)
- `event_name`
- `event_time`
- `schema_version`
- `environment` `production` | `sandbox`
- `platform` `ios` | `android` | `web`
- `app_version`, `build_number`
- `install_id` anonymous uuid
- `user_id` Supabase UUID when signed in
- `experiment_id` / `variant_id` optional

Allowed names: `first_open`, `onboarding_started`, `onboarding_step_viewed`, `onboarding_step_completed`, `onboarding_completed`, `account_created`, `sign_in_succeeded`, `meal_scan_started`, `meal_scan_succeeded`, `meal_scan_failed`, `meal_logged`, `paywall_viewed`, `purchase_started`, `app_session_started`, `landing_viewed`, `store_link_clicked`.

Allowed properties: `step_id`, `mode`, `first_meal`, `meals_today`, `plan_id`, `destination`, `placement`, `page`, `referrer`, sanitized `utm_*`.

Never send email, age, weight, diet, goal weight, images, health values, or tokens.

Ingest: `POST /functions/v1/ingest-analytics` `{ events: [...] }` idempotent on `event_id`.
