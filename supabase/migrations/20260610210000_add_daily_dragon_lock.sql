-- Daily dragon lock: one dragon per calendar day; all protein counts toward it only.
alter table public.profiles
  add column if not exists daily_dragon_id text check (daily_dragon_id in ('fire', 'ice', 'forest')),
  add column if not exists daily_dragon_date date;
