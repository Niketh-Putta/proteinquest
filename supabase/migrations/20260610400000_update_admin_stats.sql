-- Richer admin stats: split anonymous vs signed-in, highlight real engagement.

create or replace function public.get_admin_stats()
returns json
language sql
security definer
set search_path = ''
as $$
  select json_build_object(
    'supabase_accounts', (select count(*)::int from auth.users),
    'anonymous_accounts', (select count(*)::int from auth.users where is_anonymous = true),
    'signed_in_accounts', (
      select count(*)::int from auth.users where coalesce(is_anonymous, false) = false
    ),
    'real_users', (select count(distinct user_id)::int from public.protein_logs),
    'zero_log_accounts', (
      select count(*)::int
      from auth.users u
      where not exists (
        select 1 from public.protein_logs pl where pl.user_id = u.id
      )
    ),
    'total_meals', (select count(*)::int from public.protein_logs),
    'total_protein_g', (select coalesce(sum(protein_g), 0)::numeric from public.protein_logs),
    'unique_visitors_today', (
      select count(distinct ip_hash)::int
      from public.page_visits
      where visit_date = current_date
    ),
    'unique_visitors_all_time', (
      select count(distinct ip_hash)::int from public.page_visits
    )
  );
$$;
