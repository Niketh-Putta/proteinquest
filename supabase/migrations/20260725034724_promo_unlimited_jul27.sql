-- Temporary global free access (unlimited scans, no hard paywall gate).
-- Inclusive local calendar end: 2026-07-27 (covers Sat Jul 25 through Mon Jul 27).
-- After 2026-07-28 local, clients + analyze-food treat promo as expired automatically.
-- Does not modify profiles.is_premium.

update public.app_paywall_config
set
  promo_unlimited_until = '2026-07-27',
  updated_at = now()
where id = 1;
