-- Private Growth OS warehouse. App users have no access.
-- Analytics start date: 2026-09-10. Do not invent historic events.

create schema if not exists analytics;

revoke all on schema analytics from public, anon, authenticated;
grant usage on schema analytics to postgres, service_role;

do $$
begin
  execute 'alter default privileges in schema analytics revoke all on tables from public, anon, authenticated';
  execute 'alter default privileges in schema analytics revoke all on functions from public, anon, authenticated';
  execute 'alter default privileges in schema analytics revoke all on sequences from public, anon, authenticated';
exception
  when others then null;
end $$;

create table if not exists analytics.source_connections (
  provider text primary key,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'verified', 'error', 'requires_owner_access')),
  scopes text[] not null default '{}',
  data_range_start date,
  data_range_end date,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  freshness_seconds int,
  error_summary text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists analytics.import_batches (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_period text,
  cursor text,
  checksum text,
  status text not null default 'pending'
    check (status in ('pending', 'ok', 'partial', 'error')),
  inserted_count int not null default 0,
  updated_count int not null default 0,
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists import_batches_provider_period_checksum_uidx
  on analytics.import_batches (provider, coalesce(source_period, ''), coalesce(checksum, ''));

create table if not exists analytics.events (
  event_id uuid primary key,
  event_name text not null,
  event_time timestamptz not null,
  received_at timestamptz not null default now(),
  schema_version int not null default 1,
  environment text not null check (environment in ('production', 'sandbox')),
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text,
  build_number text,
  install_id uuid not null,
  user_id uuid,
  experiment_id text,
  variant_id text,
  channel text,
  properties jsonb not null default '{}'::jsonb
);

create index if not exists events_time_name_idx on analytics.events (event_time desc, event_name);
create index if not exists events_install_time_idx on analytics.events (install_id, event_time);
create index if not exists events_user_time_idx on analytics.events (user_id, event_time);
create index if not exists events_platform_time_idx on analytics.events (platform, event_time);
create index if not exists events_name_env_idx on analytics.events (event_name, environment, event_time);

create table if not exists analytics.install_identities (
  install_id uuid primary key,
  user_id uuid,
  first_seen_at timestamptz not null default now(),
  linked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  platform text,
  environment text not null default 'production'
);

create index if not exists install_identities_user_idx on analytics.install_identities (user_id);

create table if not exists analytics.exclusions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('staff_user', 'test_user', 'staff_install', 'sandbox', 'license_tester')),
  user_id uuid,
  install_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists exclusions_user_kind_uidx
  on analytics.exclusions (kind, user_id) where user_id is not null;
create unique index if not exists exclusions_install_kind_uidx
  on analytics.exclusions (kind, install_id) where install_id is not null;

create table if not exists analytics.store_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android')),
  metric_date date not null,
  country text,
  source text,
  impressions int,
  product_page_views int,
  first_time_downloads int,
  redownloads int,
  acquisitions int,
  reinstalls int,
  imported_at timestamptz not null default now()
);

create unique index if not exists store_daily_metrics_natural_uidx
  on analytics.store_daily_metrics (platform, metric_date, coalesce(country, ''), coalesce(source, ''));

create index if not exists store_daily_metrics_date_idx
  on analytics.store_daily_metrics (platform, metric_date);

create table if not exists analytics.subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  event_time timestamptz not null,
  environment text not null check (environment in ('production', 'sandbox')),
  platform text check (platform in ('ios', 'android', 'web')),
  user_id uuid,
  product_id text,
  original_transaction_id text,
  transaction_id text,
  purchase_token text,
  purchase_at timestamptz,
  expires_at timestamptz,
  entitlement_state text,
  is_trial boolean,
  amount_minor bigint,
  currency text,
  unique (provider, provider_event_id)
);

create index if not exists subscription_events_time_idx
  on analytics.subscription_events (event_time, event_type);
create index if not exists subscription_events_user_idx
  on analytics.subscription_events (user_id, event_time);
create unique index if not exists subscription_events_txn_uidx
  on analytics.subscription_events (provider, coalesce(transaction_id, ''), event_type)
  where transaction_id is not null;

create table if not exists analytics.subscriptions_current (
  user_id uuid primary key,
  provider text not null,
  product_id text,
  platform text,
  environment text not null default 'production',
  entitlement_state text not null,
  is_trial boolean not null default false,
  original_transaction_id text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists analytics.store_financials (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android', 'web')),
  period_start date not null,
  period_end date not null,
  country text,
  product_id text,
  currency text not null,
  gross_billings numeric(14, 2) not null default 0,
  refunds numeric(14, 2) not null default 0,
  taxes numeric(14, 2) not null default 0,
  platform_fees numeric(14, 2) not null default 0,
  proceeds numeric(14, 2) not null default 0,
  settlement_currency text,
  settlement_amount numeric(14, 2),
  source_statement text,
  imported_at timestamptz not null default now()
);

create unique index if not exists store_financials_natural_uidx
  on analytics.store_financials (
    platform, period_start, period_end, coalesce(country, ''), coalesce(product_id, ''), currency
  );

create table if not exists analytics.ai_usage (
  id uuid primary key default gen_random_uuid(),
  request_id text not null default gen_random_uuid()::text,
  scan_id text,
  provider text not null,
  model text not null,
  requested_at timestamptz not null default now(),
  input_tokens int,
  output_tokens int,
  cached_tokens int,
  image_count int,
  latency_ms int,
  status text not null,
  retry_count int not null default 0,
  estimated_cost_usd numeric(12, 6),
  pricing_as_of date
);

alter table analytics.ai_usage
  add constraint ai_usage_provider_request_key unique (provider, request_id);

create index if not exists ai_usage_time_idx on analytics.ai_usage (requested_at desc);

create table if not exists analytics.expenses (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  category text not null
    check (category in (
      'apple_membership', 'google_registration', 'ai', 'infrastructure',
      'software', 'marketing', 'domain', 'email', 'other'
    )),
  amount numeric(14, 2) not null,
  currency text not null,
  tax numeric(14, 2) not null default 0,
  expense_date date not null,
  coverage_start date,
  coverage_end date,
  recurrence text not null default 'one_time'
    check (recurrence in ('one_time', 'monthly', 'annual')),
  source text not null default 'manual_invoice',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists analytics.fx_rates (
  rate_date date not null,
  source text not null,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18, 8) not null,
  primary key (rate_date, source, base_currency, quote_currency)
);

create table if not exists analytics.daily_rollups (
  metric_date date not null,
  platform text not null,
  channel text not null default 'unknown',
  first_opens int not null default 0,
  onboarding_started int not null default 0,
  onboarding_completed int not null default 0,
  accounts_created int not null default 0,
  sign_ins int not null default 0,
  meal_scans_started int not null default 0,
  meal_scans_succeeded int not null default 0,
  meal_scans_failed int not null default 0,
  meals_logged int not null default 0,
  first_meals int not null default 0,
  paywall_views int not null default 0,
  purchase_starts int not null default 0,
  website_visitors int not null default 0,
  store_clicks int not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (metric_date, platform, channel)
);

create table if not exists analytics.cohort_retention (
  cohort_date date not null,
  platform text not null,
  channel text not null default 'unknown',
  cohort_size int not null default 0,
  returned_d1 int,
  returned_d7 int,
  returned_d30 int,
  matured_d1 boolean not null default false,
  matured_d7 boolean not null default false,
  matured_d30 boolean not null default false,
  refreshed_at timestamptz not null default now(),
  primary key (cohort_date, platform, channel)
);

create table if not exists analytics.webhook_replays (
  provider text not null,
  notification_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, notification_id)
);

create table if not exists analytics.identity_deletions (
  install_id uuid,
  user_id uuid,
  deleted_at timestamptz not null default now(),
  reason text
);

alter table analytics.source_connections enable row level security;
alter table analytics.import_batches enable row level security;
alter table analytics.events enable row level security;
alter table analytics.install_identities enable row level security;
alter table analytics.exclusions enable row level security;
alter table analytics.store_daily_metrics enable row level security;
alter table analytics.subscription_events enable row level security;
alter table analytics.subscriptions_current enable row level security;
alter table analytics.store_financials enable row level security;
alter table analytics.ai_usage enable row level security;
alter table analytics.expenses enable row level security;
alter table analytics.fx_rates enable row level security;
alter table analytics.daily_rollups enable row level security;
alter table analytics.cohort_retention enable row level security;
alter table analytics.webhook_replays enable row level security;
alter table analytics.identity_deletions enable row level security;

insert into analytics.source_connections (provider, status, notes) values
  ('supabase', 'connected', 'Production project proteinlens (csxdkvpvcasuknhnprxp). App tables readable by service role only for aggregates.'),
  ('app_events', 'connected', 'Ingest live from 2026-09-10. No historic backfill.'),
  ('website', 'connected', 'proteinquest.app landing_viewed / store_link_clicked from this ship.'),
  ('revenuecat', 'requires_owner_access', 'Webhook implemented. Verify REVENUECAT_WEBHOOK_AUTH and dashboard destination.'),
  ('app_store_connect', 'requires_owner_access', 'Needs ASC .p8, issuer, vendor number in server secrets.'),
  ('app_store_server', 'requires_owner_access', 'Needs App Store Server Notifications V2 secret.'),
  ('google_play', 'requires_owner_access', 'Needs Play service account + financial report bucket.'),
  ('google_rtdn', 'requires_owner_access', 'Needs Pub/Sub / RTDN verification.'),
  ('openai', 'connected', 'Per-request estimates from analyze-food. Official invoice reconcile needs owner usage key.'),
  ('fx', 'connected', 'Frankfurter / ECB daily rates pulled when converting to GBP.'),
  ('apple_membership_invoice', 'requires_owner_access', 'Enter the real membership invoice. Do not assume USD 99.'),
  ('google_registration_invoice', 'requires_owner_access', 'Enter the real Play registration invoice. Do not assume USD 25.'),
  ('vercel', 'requires_owner_access', 'Manual invoice or billing API.'),
  ('ads_apple_search', 'not_connected', 'No paid ASA account confirmed.'),
  ('ads_meta', 'not_connected', 'No Meta ads account confirmed.'),
  ('ads_tiktok', 'not_connected', 'No TikTok ads account confirmed.'),
  ('ads_google', 'not_connected', 'No Google ads account confirmed.')
on conflict (provider) do nothing;

insert into analytics.exclusions (kind, user_id, note)
select 'staff_user', 'c1f09a00-e65f-4ad7-987c-83f601c11815'::uuid, 'Complimentary Pro: Bigger N'
where not exists (
  select 1 from analytics.exclusions
  where kind = 'staff_user' and user_id = 'c1f09a00-e65f-4ad7-987c-83f601c11815'
);
insert into analytics.exclusions (kind, user_id, note)
select 'staff_user', 'a247ad33-40ae-4e3e-bd64-fb70882e3d59'::uuid, 'Complimentary Pro: Lil B'
where not exists (
  select 1 from analytics.exclusions
  where kind = 'staff_user' and user_id = 'a247ad33-40ae-4e3e-bd64-fb70882e3d59'
);

create or replace function analytics.is_excluded_user(p_user uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from analytics.exclusions
    where user_id = p_user
  );
$$;

create or replace function analytics.is_excluded_install(p_install uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from analytics.exclusions
    where install_id = p_install
  );
$$;

create or replace function analytics.ingest_event(
  p_event_id uuid,
  p_event_name text,
  p_event_time timestamptz,
  p_schema_version int,
  p_environment text,
  p_platform text,
  p_app_version text,
  p_build_number text,
  p_install_id uuid,
  p_user_id uuid,
  p_experiment_id text,
  p_variant_id text,
  p_channel text,
  p_properties jsonb
)
returns boolean
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  inserted boolean := false;
begin
  if p_environment = 'sandbox' then
    insert into analytics.exclusions (kind, install_id, note)
    select 'sandbox', p_install_id, 'sandbox event'
    where not exists (
      select 1 from analytics.exclusions
      where kind = 'sandbox' and install_id = p_install_id
    );
  end if;

  insert into analytics.events (
    event_id, event_name, event_time, schema_version, environment, platform,
    app_version, build_number, install_id, user_id, experiment_id, variant_id,
    channel, properties
  ) values (
    p_event_id, p_event_name, p_event_time, coalesce(p_schema_version, 1),
    p_environment, p_platform, p_app_version, p_build_number, p_install_id,
    p_user_id, p_experiment_id, p_variant_id, p_channel, coalesce(p_properties, '{}'::jsonb)
  )
  on conflict (event_id) do nothing;

  inserted := found;

  insert into analytics.install_identities (install_id, user_id, platform, environment, first_seen_at, last_seen_at, linked_at)
  values (
    p_install_id,
    p_user_id,
    p_platform,
    p_environment,
    p_event_time,
    p_event_time,
    case when p_user_id is not null then now() else null end
  )
  on conflict (install_id) do update set
    last_seen_at = excluded.last_seen_at,
    platform = coalesce(analytics.install_identities.platform, excluded.platform),
    user_id = case
      when analytics.install_identities.user_id is null then excluded.user_id
      else analytics.install_identities.user_id
    end,
    linked_at = case
      when analytics.install_identities.user_id is null and excluded.user_id is not null then now()
      else analytics.install_identities.linked_at
    end;

  return inserted;
end;
$$;

revoke all on function analytics.ingest_event(
  uuid, text, timestamptz, int, text, text, text, text, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;

create or replace function analytics.refresh_rollups()
returns timestamptz
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  delete from analytics.daily_rollups;

  insert into analytics.daily_rollups (
    metric_date, platform, channel,
    first_opens, onboarding_started, onboarding_completed,
    accounts_created, sign_ins, meal_scans_started, meal_scans_succeeded,
    meal_scans_failed, meals_logged, first_meals, paywall_views, purchase_starts,
    website_visitors, store_clicks, refreshed_at
  )
  select
    ((e.event_time at time zone 'UTC')::date) as metric_date,
    e.platform,
    coalesce(nullif(e.channel, ''), 'unknown'),
    count(*) filter (where e.event_name = 'first_open'),
    count(*) filter (where e.event_name = 'onboarding_started'),
    count(*) filter (where e.event_name = 'onboarding_completed'),
    count(*) filter (where e.event_name = 'account_created'),
    count(*) filter (where e.event_name = 'sign_in_succeeded'),
    count(*) filter (where e.event_name = 'meal_scan_started'),
    count(*) filter (where e.event_name = 'meal_scan_succeeded'),
    count(*) filter (where e.event_name = 'meal_scan_failed'),
    count(*) filter (where e.event_name = 'meal_logged'),
    count(*) filter (where e.event_name = 'meal_logged' and coalesce(e.properties->>'first_meal', 'false') = 'true'),
    count(*) filter (where e.event_name = 'paywall_viewed'),
    count(*) filter (where e.event_name = 'purchase_started'),
    count(*) filter (where e.event_name = 'landing_viewed'),
    count(*) filter (where e.event_name = 'store_link_clicked'),
    now()
  from analytics.events e
  where e.environment = 'production'
    and not analytics.is_excluded_install(e.install_id)
    and (e.user_id is null or not analytics.is_excluded_user(e.user_id))
  group by 1, 2, 3;

  delete from analytics.cohort_retention;

  insert into analytics.cohort_retention (
    cohort_date, platform, channel, cohort_size,
    returned_d1, returned_d7, returned_d30,
    matured_d1, matured_d7, matured_d30, refreshed_at
  )
  select
    c.cohort_date,
    c.platform,
    c.channel,
    count(*)::int,
    count(*) filter (where c.matured_d1 and c.returned_d1)::int,
    count(*) filter (where c.matured_d7 and c.returned_d7)::int,
    count(*) filter (where c.matured_d30 and c.returned_d30)::int,
    bool_or(c.matured_d1),
    bool_or(c.matured_d7),
    bool_or(c.matured_d30),
    now()
  from (
    select
      i.install_id,
      (i.first_seen_at at time zone 'UTC')::date as cohort_date,
      coalesce(i.platform, 'web') as platform,
      'unknown'::text as channel,
      (current_date - (i.first_seen_at at time zone 'UTC')::date) >= 1 as matured_d1,
      (current_date - (i.first_seen_at at time zone 'UTC')::date) >= 7 as matured_d7,
      (current_date - (i.first_seen_at at time zone 'UTC')::date) >= 30 as matured_d30,
      exists (
        select 1 from analytics.events e
        where e.install_id = i.install_id
          and e.event_name in ('meal_scan_succeeded', 'meal_logged')
          and e.event_time >= i.first_seen_at + interval '1 day'
          and e.event_time < i.first_seen_at + interval '2 day'
      ) as returned_d1,
      exists (
        select 1 from analytics.events e
        where e.install_id = i.install_id
          and e.event_name in ('meal_scan_succeeded', 'meal_logged')
          and e.event_time >= i.first_seen_at + interval '7 day'
          and e.event_time < i.first_seen_at + interval '8 day'
      ) as returned_d7,
      exists (
        select 1 from analytics.events e
        where e.install_id = i.install_id
          and e.event_name in ('meal_scan_succeeded', 'meal_logged')
          and e.event_time >= i.first_seen_at + interval '30 day'
          and e.event_time < i.first_seen_at + interval '31 day'
      ) as returned_d30
    from analytics.install_identities i
    where i.environment = 'production'
      and not analytics.is_excluded_install(i.install_id)
      and (i.user_id is null or not analytics.is_excluded_user(i.user_id))
  ) c
  group by 1, 2, 3;

  update analytics.source_connections
  set last_success_at = now(), last_attempt_at = now(), status = 'connected', updated_at = now()
  where provider in ('supabase', 'app_events');

  return now();
end;
$$;

revoke all on function analytics.refresh_rollups() from public, anon, authenticated;

create or replace function analytics.record_ai_usage(
  p_request_id text,
  p_scan_id text,
  p_provider text,
  p_model text,
  p_input_tokens int,
  p_output_tokens int,
  p_cached_tokens int,
  p_image_count int,
  p_latency_ms int,
  p_status text,
  p_retry_count int,
  p_estimated_cost_usd numeric,
  p_pricing_as_of date
)
returns void
language plpgsql
security definer
set search_path = analytics
as $$
begin
  insert into analytics.ai_usage (
    request_id, scan_id, provider, model, input_tokens, output_tokens,
    cached_tokens, image_count, latency_ms, status, retry_count,
    estimated_cost_usd, pricing_as_of
  ) values (
    coalesce(p_request_id, gen_random_uuid()::text), p_scan_id, p_provider, p_model,
    p_input_tokens, p_output_tokens, p_cached_tokens, p_image_count, p_latency_ms,
    p_status, coalesce(p_retry_count, 0), p_estimated_cost_usd, p_pricing_as_of
  )
  on conflict (provider, request_id) do update set
    status = excluded.status,
    retry_count = excluded.retry_count,
    estimated_cost_usd = excluded.estimated_cost_usd;
end;
$$;

revoke all on function analytics.record_ai_usage(
  text, text, text, text, int, int, int, int, int, text, int, numeric, date
) from public, anon, authenticated;

create or replace function public.ingest_event(
  p_event_id uuid,
  p_event_name text,
  p_event_time timestamptz,
  p_schema_version int,
  p_environment text,
  p_platform text,
  p_app_version text,
  p_build_number text,
  p_install_id uuid,
  p_user_id uuid,
  p_experiment_id text,
  p_variant_id text,
  p_channel text,
  p_properties jsonb
)
returns boolean
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  return analytics.ingest_event(
    p_event_id, p_event_name, p_event_time, p_schema_version, p_environment,
    p_platform, p_app_version, p_build_number, p_install_id, p_user_id,
    p_experiment_id, p_variant_id, p_channel, p_properties
  );
end;
$$;

create or replace function public.refresh_analytics_rollups()
returns timestamptz
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  return analytics.refresh_rollups();
end;
$$;

create or replace function public.record_ai_usage(
  p_request_id text,
  p_scan_id text,
  p_provider text,
  p_model text,
  p_input_tokens int,
  p_output_tokens int,
  p_cached_tokens int,
  p_image_count int,
  p_latency_ms int,
  p_status text,
  p_retry_count int,
  p_estimated_cost_usd numeric,
  p_pricing_as_of date
)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  perform analytics.record_ai_usage(
    p_request_id, p_scan_id, p_provider, p_model, p_input_tokens, p_output_tokens,
    p_cached_tokens, p_image_count, p_latency_ms, p_status, p_retry_count,
    p_estimated_cost_usd, p_pricing_as_of
  );
end;
$$;

revoke all on function public.ingest_event(
  uuid, text, timestamptz, int, text, text, text, text, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.refresh_analytics_rollups() from public, anon, authenticated;
revoke all on function public.record_ai_usage(
  text, text, text, text, int, int, int, int, int, text, int, numeric, date
) from public, anon, authenticated;
grant execute on function public.ingest_event(
  uuid, text, timestamptz, int, text, text, text, text, uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.refresh_analytics_rollups() to service_role;
grant execute on function public.record_ai_usage(
  text, text, text, text, int, int, int, int, int, text, int, numeric, date
) to service_role;

grant usage on schema analytics to service_role, postgres;
grant all on all tables in schema analytics to service_role, postgres;
grant all on all sequences in schema analytics to service_role, postgres;
grant all on all functions in schema analytics to service_role, postgres;

do $$
begin
  execute $c$alter role authenticator set pgrst.db_schemas = 'public, graphql_public, analytics'$c$;
exception
  when others then null;
end $$;
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
