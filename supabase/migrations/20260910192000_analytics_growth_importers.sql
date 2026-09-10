create or replace function public.growth_mark_connection(
  p_provider text,
  p_status text,
  p_error text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.source_connections (provider, status, last_attempt_at, last_success_at, error_summary, notes, updated_at)
  values (
    p_provider,
    p_status,
    now(),
    case when p_status = 'connected' then now() else null end,
    p_error,
    p_notes,
    now()
  )
  on conflict (provider) do update set
    status = excluded.status,
    last_attempt_at = now(),
    last_success_at = case when excluded.status = 'connected' then now() else analytics.source_connections.last_success_at end,
    error_summary = excluded.error_summary,
    notes = coalesce(excluded.notes, analytics.source_connections.notes),
    updated_at = now();
end;
$$;

create or replace function public.growth_insert_store_daily(
  p_platform text,
  p_metric_date date,
  p_country text default null,
  p_source text default null,
  p_first_time_downloads int default null,
  p_acquisitions int default null
)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.store_daily_metrics (
    platform, metric_date, country, source, first_time_downloads, acquisitions
  ) values (
    p_platform, p_metric_date, p_country, p_source, p_first_time_downloads, p_acquisitions
  )
  on conflict (platform, metric_date, coalesce(country, ''), coalesce(source, '')) do update set
    first_time_downloads = coalesce(excluded.first_time_downloads, analytics.store_daily_metrics.first_time_downloads),
    acquisitions = coalesce(excluded.acquisitions, analytics.store_daily_metrics.acquisitions),
    imported_at = now();
end;
$$;

create or replace function public.growth_upsert_fx(
  p_rate_date date,
  p_source text,
  p_base text,
  p_quote text,
  p_rate numeric
)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.fx_rates (rate_date, source, base_currency, quote_currency, rate)
  values (p_rate_date, p_source, p_base, p_quote, p_rate)
  on conflict (rate_date, source, base_currency, quote_currency) do update set
    rate = excluded.rate;
end;
$$;

revoke all on function public.growth_mark_connection(text, text, text, text) from public, anon, authenticated;
revoke all on function public.growth_insert_store_daily(text, date, text, text, int, int) from public, anon, authenticated;
revoke all on function public.growth_upsert_fx(date, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.growth_mark_connection(text, text, text, text) to service_role;
grant execute on function public.growth_insert_store_daily(text, date, text, text, int, int) to service_role;
grant execute on function public.growth_upsert_fx(date, text, text, text, numeric) to service_role;
