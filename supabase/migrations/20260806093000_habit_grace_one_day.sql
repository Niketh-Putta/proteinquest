-- New users: 1 calendar day unlimited, then 1 free meal/day.
update public.app_paywall_config
set
  habit_grace_days = 1,
  free_daily_scans = 1,
  updated_at = now()
where id = 1;

alter table public.app_paywall_config
  alter column habit_grace_days set default 1;
