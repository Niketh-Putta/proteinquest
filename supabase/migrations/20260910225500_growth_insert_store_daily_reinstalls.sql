create or replace function public.growth_insert_store_daily(
  p_platform text,
  p_metric_date date,
  p_country text default null,
  p_source text default null,
  p_first_time_downloads int default null,
  p_acquisitions int default null,
  p_impressions int default null,
  p_product_page_views int default null,
  p_redownloads int default null,
  p_reinstalls int default null
)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.store_daily_metrics (
    platform, metric_date, country, source,
    first_time_downloads, acquisitions, impressions, product_page_views, redownloads, reinstalls
  ) values (
    p_platform, p_metric_date, p_country, p_source,
    p_first_time_downloads, p_acquisitions, p_impressions, p_product_page_views, p_redownloads, p_reinstalls
  )
  on conflict (platform, metric_date, coalesce(country, ''), coalesce(source, '')) do update set
    first_time_downloads = coalesce(excluded.first_time_downloads, analytics.store_daily_metrics.first_time_downloads),
    acquisitions = coalesce(excluded.acquisitions, analytics.store_daily_metrics.acquisitions),
    impressions = coalesce(excluded.impressions, analytics.store_daily_metrics.impressions),
    product_page_views = coalesce(excluded.product_page_views, analytics.store_daily_metrics.product_page_views),
    redownloads = coalesce(excluded.redownloads, analytics.store_daily_metrics.redownloads),
    reinstalls = coalesce(excluded.reinstalls, analytics.store_daily_metrics.reinstalls),
    imported_at = now();
end;
$$;

drop function if exists public.growth_insert_store_daily(text, date, text, text, int, int, int, int, int);

revoke all on function public.growth_insert_store_daily(text, date, text, text, int, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.growth_insert_store_daily(text, date, text, text, int, int, int, int, int, int) to service_role;
