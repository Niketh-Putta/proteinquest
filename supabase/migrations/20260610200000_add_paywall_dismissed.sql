-- Track when a free user dismisses the post-onboarding paywall (Cal AI-style soft gate).
alter table public.profiles
  add column if not exists paywall_dismissed boolean not null default false;

update public.profiles
set paywall_dismissed = true
where is_premium = true;
