-- Align grace-period stats with 2-day habit trial (was 3).
create or replace function public.get_grace_period_stats()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'grace_completed', (
      select count(*)::int
      from public.profiles p
      where not p.is_premium
        and p.created_at is not null
        and (current_date - (p.created_at at time zone 'UTC')::date) >= 2
    ),
    'grace_active', (
      select count(*)::int
      from public.profiles p
      where not p.is_premium
        and p.created_at is not null
        and (current_date - (p.created_at at time zone 'UTC')::date) >= 0
        and (current_date - (p.created_at at time zone 'UTC')::date) < 2
    )
  );
$$;

revoke all on function public.get_grace_period_stats() from public;
grant execute on function public.get_grace_period_stats() to service_role;
