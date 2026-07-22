-- Custom names per dragon (fire / ice / forest).
alter table public.profiles
  add column if not exists dragon_names jsonb not null default '{}'::jsonb;
