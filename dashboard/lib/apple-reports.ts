export const APP_BUNDLE_ID = "com.proteinquest.app";
export const APPLE_APP_SKUS = [APP_BUNDLE_ID, "proteinquest"];
export const APPLE_IAP_SKUS = ["pro_weekly", "pro_yearly"];
export const APPLE_DOWNLOAD_TYPES = new Set(["1", "1F", "1T", "1-B", "1E", "1EP", "F1"]);
export const APPLE_FINANCE_REGIONS = ["US", "EU", "GB", "WW"];

export function parseAppleReportDate(raw: string, fallback?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (mdy) {
    const month = mdy[1]!.padStart(2, "0");
    const day = mdy[2]!.padStart(2, "0");
    return `${mdy[3]}-${month}-${day}`;
  }
  return fallback && /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : null;
}

export function monthKeys(count: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthDateRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const start = `${month}-01`;
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start, end: `${month}-${String(last).padStart(2, "0")}` };
}

function cell(row: Record<string, string>, ...names: string[]) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== "") return String(row[name]).trim();
  }
  return "";
}

export function isAppleAppDownloadRow(row: Record<string, string>): boolean {
  const type = cell(row, "Product Type Identifier");
  if (!APPLE_DOWNLOAD_TYPES.has(type)) return false;
  const sku = cell(row, "SKU", "Vendor Identifier");
  const parent = cell(row, "Parent Identifier");
  if (!sku && !parent) return true;
  return APPLE_APP_SKUS.includes(sku) || APPLE_APP_SKUS.includes(parent);
}

export function isAppleCatalogRow(row: Record<string, string>): boolean {
  const sku = cell(row, "SKU", "Vendor Identifier");
  const parent = cell(row, "Parent Identifier");
  if (APPLE_APP_SKUS.includes(sku) || APPLE_IAP_SKUS.includes(sku)) return true;
  if (parent && APPLE_APP_SKUS.includes(parent)) return true;
  return false;
}

export type AppleSalesUnitRow = {
  date: string;
  country: string | null;
  units: number;
};

export function parseAppleSalesUnits(rows: Record<string, string>[], fallbackMonth: string): AppleSalesUnitRow[] {
  const fallback = `${fallbackMonth}-01`;
  const out: AppleSalesUnitRow[] = [];
  for (const row of rows) {
    if (!isAppleAppDownloadRow(row)) continue;
    const date = parseAppleReportDate(cell(row, "Begin Date", "Date"), fallback);
    if (!date) continue;
    const units = Number.parseFloat(cell(row, "Units")) || 0;
    out.push({
      date,
      country: cell(row, "Country Code") || null,
      units: Math.max(0, Math.round(units)),
    });
  }
  return out;
}

export type AppleFinanceRow = {
  periodStart: string;
  periodEnd: string;
  country: string | null;
  productId: string | null;
  currency: string;
  grossBillings: number;
  refunds: number;
  taxes: number;
  platformFees: number;
  proceeds: number;
  settlementCurrency: string | null;
  settlementAmount: number | null;
  sourceStatement: string;
};

function money(raw: string): number {
  const n = Number.parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseAppleFinanceRows(
  rows: Record<string, string>[],
  fallbackMonth: string,
  sourceStatement: string,
): AppleFinanceRow[] {
  const range = monthDateRange(fallbackMonth);
  const grouped = new Map<string, AppleFinanceRow>();
  for (const row of rows) {
    if (!isAppleCatalogRow(row)) continue;
    const periodStart = parseAppleReportDate(cell(row, "Start Date", "Begin Date"), range.start) ?? range.start;
    const periodEnd = parseAppleReportDate(cell(row, "End Date"), range.end) ?? range.end;
    const productId = cell(row, "SKU", "Vendor Identifier") || null;
    const country = cell(row, "Country Of Sale", "Country Code") || null;
    const currency = cell(row, "Partner Share Currency", "Currency of Proceeds", "Customer Currency") || "USD";
    const qty = money(cell(row, "Quantity", "Units"));
    const customerPrice = money(cell(row, "Customer Price"));
    const extended = cell(row, "Extended Partner Share")
      ? money(cell(row, "Extended Partner Share"))
      : money(cell(row, "Partner Share", "Developer Proceeds")) * qty;
    const saleOrReturn = cell(row, "Sales or Return").toUpperCase();
    const isReturn = saleOrReturn.startsWith("R") || qty < 0 || extended < 0;
    const lineGross = Math.abs(qty) * Math.abs(customerPrice);
    const key = `${periodStart}|${periodEnd}|${country ?? ""}|${productId ?? ""}|${currency}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        periodStart,
        periodEnd,
        country,
        productId,
        currency,
        grossBillings: 0,
        refunds: 0,
        taxes: money(cell(row, "Tax", "Taxes", "Withholding Tax")),
        platformFees: 0,
        proceeds: 0,
        settlementCurrency: currency,
        settlementAmount: 0,
        sourceStatement,
      });
    }
    const current = grouped.get(key)!;
    if (isReturn) current.refunds += lineGross;
    else current.grossBillings += lineGross;
    current.proceeds += extended;
    current.settlementAmount = (current.settlementAmount ?? 0) + extended;
  }
  return [...grouped.values()].filter(
    (row) => row.grossBillings || row.refunds || row.proceeds,
  );
}
