create or replace function public.growth_unique_web_people(p_event text, p_from date, p_to date)
returns int
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  if p_event not in ('landing_viewed', 'store_link_clicked') then
    return 0;
  end if;
  return (
    select count(distinct e.install_id)::int
    from analytics.events e
    where e.environment = 'production'
      and e.event_name = p_event
      and ((e.event_time at time zone 'UTC')::date) >= p_from
      and ((e.event_time at time zone 'UTC')::date) <= p_to
  );
end;
$$;

revoke all on function public.growth_unique_web_people(text, date, date) from public, anon, authenticated;
grant execute on function public.growth_unique_web_people(text, date, date) to service_role;
