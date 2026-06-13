-- Social proof for the paywall: a friendly running total of Pro members.
-- Starts at a 23-member offset and grows by one for every real Pro subscriber.
-- Security definer so anon/auth clients get the count without broad profile RLS.

create or replace function public.pro_member_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select 23 + (
    select count(*)::int
      from public.profiles
     where is_premium = true
  );
$$;

grant execute on function public.pro_member_count() to authenticated, anon;
