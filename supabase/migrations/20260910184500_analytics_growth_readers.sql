create or replace function public.growth_table(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  if p_name = 'source_connections' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.source_connections t);
  elsif p_name = 'daily_rollups' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.daily_rollups t);
  elsif p_name = 'store_daily_metrics' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.store_daily_metrics t);
  elsif p_name = 'store_financials' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.store_financials t);
  elsif p_name = 'subscription_events' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.subscription_events t);
  elsif p_name = 'ai_usage' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.ai_usage t);
  elsif p_name = 'expenses' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.expenses t);
  elsif p_name = 'cohort_retention' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.cohort_retention t);
  elsif p_name = 'exclusions' then
    return (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from analytics.exclusions t);
  else
    return '[]'::jsonb;
  end if;
end;
$$;

revoke all on function public.growth_table(text) from public, anon, authenticated;
grant execute on function public.growth_table(text) to service_role;
