-- Anonymous page visit tracking (hashed IP + UA, one row per IP per day)

create table public.page_visits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  user_agent_hash text,
  visited_at timestamptz not null default now(),
  visit_date date not null default current_date
);

create unique index page_visits_ip_date_idx
  on public.page_visits (ip_hash, visit_date);

create index page_visits_date_idx
  on public.page_visits (visit_date);

alter table public.page_visits enable row level security;

-- No RLS policies: only service_role (edge functions) can read/write.

-- Aggregated stats callable only by service_role (edge function admin-stats).
create or replace function public.get_admin_stats()
returns json
language sql
security definer
set search_path = ''
as $$
  select json_build_object(
    'total_accounts', (select count(*)::int from auth.users),
    'total_meals', (select count(*)::int from public.protein_logs),
    'active_loggers', (select count(distinct user_id)::int from public.protein_logs),
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

revoke execute on function public.get_admin_stats() from public, anon, authenticated;
grant execute on function public.get_admin_stats() to service_role;
