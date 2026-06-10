-- Track one-time intro walkthrough (Cal AI / Locked style)
alter table public.profiles
  add column if not exists intro_completed boolean not null default false;

update public.profiles
set intro_completed = true
where onboarded = true and intro_completed = false;
