-- Remote freemium / promo controls. Edit the singleton row in the dashboard;
-- clients pick it up on next open (no app rebuild).

create table public.app_paywall_config (
  id int primary key default 1 check (id = 1),
  free_daily_scans int not null default 1 check (free_daily_scans >= 0 and free_daily_scans <= 100),
  habit_grace_days int not null default 2 check (habit_grace_days >= 0 and habit_grace_days <= 30),
  grandfather_free_daily_scans int not null default 1
    check (grandfather_free_daily_scans >= 0 and grandfather_free_daily_scans <= 100),
  -- Local calendar date (YYYY-MM-DD). When set and today <= this date, all users get unlimited scans.
  promo_unlimited_until date,
  updated_at timestamptz not null default now()
);

comment on table public.app_paywall_config is
  'Singleton remote freemium config: free scans/day, trial length, promo unlimited-until date.';

comment on column public.app_paywall_config.promo_unlimited_until is
  'Inclusive end date (local calendar) for temporary full scan access for everyone. Null = off.';

insert into public.app_paywall_config (
  id,
  free_daily_scans,
  habit_grace_days,
  grandfather_free_daily_scans,
  promo_unlimited_until
) values (1, 1, 2, 1, null);

create trigger app_paywall_config_set_updated_at
  before update on public.app_paywall_config
  for each row
  execute function public.set_updated_at();

alter table public.app_paywall_config enable row level security;

create policy "Anyone can read app paywall config"
  on public.app_paywall_config
  for select
  to anon, authenticated
  using (true);
