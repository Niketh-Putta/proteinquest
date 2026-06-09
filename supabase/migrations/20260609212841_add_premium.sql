-- Freemium: premium flag on profiles.
-- NOTE: set server-side by payment webhooks in production (RevenueCat/Stripe),
-- not by the client. For the MVP the dev unlock writes it directly.
alter table public.profiles
  add column is_premium boolean not null default false;
