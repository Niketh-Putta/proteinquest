create or replace function public.growth_insert_store_financial(
  p_platform text,
  p_period_start date,
  p_period_end date,
  p_country text default null,
  p_product_id text default null,
  p_currency text default 'USD',
  p_gross_billings numeric default 0,
  p_refunds numeric default 0,
  p_taxes numeric default 0,
  p_platform_fees numeric default 0,
  p_proceeds numeric default 0,
  p_settlement_currency text default null,
  p_settlement_amount numeric default null,
  p_source_statement text default null
)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.store_financials (
    platform, period_start, period_end, country, product_id, currency,
    gross_billings, refunds, taxes, platform_fees, proceeds,
    settlement_currency, settlement_amount, source_statement
  ) values (
    p_platform, p_period_start, p_period_end, p_country, p_product_id, p_currency,
    p_gross_billings, p_refunds, p_taxes, p_platform_fees, p_proceeds,
    p_settlement_currency, p_settlement_amount, p_source_statement
  )
  on conflict (platform, period_start, period_end, coalesce(country, ''), coalesce(product_id, ''), currency)
  do update set
    gross_billings = excluded.gross_billings,
    refunds = excluded.refunds,
    taxes = excluded.taxes,
    platform_fees = excluded.platform_fees,
    proceeds = excluded.proceeds,
    settlement_currency = coalesce(excluded.settlement_currency, analytics.store_financials.settlement_currency),
    settlement_amount = coalesce(excluded.settlement_amount, analytics.store_financials.settlement_amount),
    source_statement = coalesce(excluded.source_statement, analytics.store_financials.source_statement),
    imported_at = now();
end;
$$;

revoke all on function public.growth_insert_store_financial(
  text, date, date, text, text, text, numeric, numeric, numeric, numeric, numeric, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.growth_insert_store_financial(
  text, date, date, text, text, text, numeric, numeric, numeric, numeric, numeric, text, numeric, text
) to service_role;
