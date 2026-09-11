import { inflateRawSync } from "node:zlib";

export const APP_SKU = "com.proteinquest.app";

/** Known Play developer account IDs already used for GCS report discovery. */
export const PLAY_DEVELOPER_ID_CANDIDATES = [
  "6372752371369019039",
  "63722752313690019033",
  "4972385690429690675",
  "4972385690429690676",
  "04972385690429690675",
];

export function normalizePlayBucket(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return value.replace(/^gs:\/\//i, "").replace(/\/+$/, "").split("/")[0] || null;
}

export function playBucketCandidates(developerId?: string | null, bucket?: string | null): string[] {
  const out = new Set<string>();
  const named = normalizePlayBucket(bucket);
  if (named) out.add(named);
  const ids = [developerId?.trim(), ...PLAY_DEVELOPER_ID_CANDIDATES].filter(Boolean) as string[];
  for (const id of ids) {
    out.add(`pubsite_prod_rev_${id}`);
    out.add(`pubsite_prod_${id}`);
    if (!id.startsWith("0")) {
      out.add(`pubsite_prod_rev_0${id}`);
      out.add(`pubsite_prod_0${id}`);
    }
  }
  return [...out];
}

export function isPlayOverviewObject(name: string): boolean {
  return name.includes(`installs_${APP_SKU}_`) && name.includes("_overview.csv");
}

export function isPlayFinancialObject(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("installs_") || lower.includes("crashes_") || lower.includes("ratings_")) return false;
  return (
    /\/(earnings|sales|financials?)\//i.test(name) ||
    /earnings_|salesreport_|financial/i.test(name.split("/").pop() ?? "")
  );
}

function decodePlayCsv(raw: string | Buffer): string {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.alloc(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]!;
      swapped[i - 1] = buf[i]!;
    }
    return swapped.toString("utf16le");
  }
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((ch === "," || ch === "\t") && !quoted) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols.map((c) => c.replace(/^"|"$/g, ""));
}

export type PlayOverviewRow = {
  date: string;
  acquisitions: number;
  reinstalls: number;
};

export function parsePlayOverviewCsv(raw: string | Buffer): PlayOverviewRow[] {
  const text = decodePlayCsv(raw);
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? "").map((h) => h.trim());
  const dateIdx = headers.findIndex((h) => /^date$/i.test(h));
  const acqIdx = headers.findIndex((h) =>
    /^(Daily User Installs|User Installs|Daily Device Installs)$/i.test(h),
  );
  const preferredAcq = headers.findIndex((h) => /^Daily User Installs$/i.test(h));
  const reinstallIdx = headers.findIndex((h) => /reinstall/i.test(h));
  const acquisitionsIdx = preferredAcq >= 0 ? preferredAcq : acqIdx;
  const rows: PlayOverviewRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const date = (cols[dateIdx] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const acquisitions = Number.parseInt(cols[acquisitionsIdx] ?? "0", 10) || 0;
    const reinstalls = reinstallIdx >= 0 ? Number.parseInt(cols[reinstallIdx] ?? "0", 10) || 0 : 0;
    rows.push({ date, acquisitions, reinstalls });
  }
  return rows;
}

export type PlayFinanceRow = {
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
  settlementCurrency: string;
  settlementAmount: number;
  sourceStatement: string;
};

function moneyCell(raw: string): number {
  const n = Number.parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function playDate(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (mdy) return `${mdy[3]}-${mdy[1]!.padStart(2, "0")}-${mdy[2]!.padStart(2, "0")}`;
  return null;
}

export function unzipCsvBuffers(raw: Buffer): Buffer[] {
  if (raw.length < 4 || raw[0] !== 0x50 || raw[1] !== 0x4b) return [raw];
  const out: Buffer[] = [];
  let i = 0;
  while (i + 30 <= raw.length) {
    if (raw.readUInt32LE(i) !== 0x04034b50) break;
    const method = raw.readUInt16LE(i + 8);
    const compSize = raw.readUInt32LE(i + 18);
    const nameLen = raw.readUInt16LE(i + 26);
    const extraLen = raw.readUInt16LE(i + 28);
    const name = raw.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    const data = raw.subarray(start, start + compSize);
    i = start + compSize;
    if (!/\.csv$/i.test(name) && !/\.txt$/i.test(name)) continue;
    if (method === 0) out.push(Buffer.from(data));
    else if (method === 8) out.push(inflateRawSync(data));
  }
  return out.length ? out : [raw];
}

export function parsePlayFinanceCsv(raw: string | Buffer, sourceStatement: string): PlayFinanceRow[] {
  const text = decodePlayCsv(raw);
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? "").map((h) => h.trim());
  const idx = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const dateIdx = idx(/^(Transaction Date|Order Charged Date|Date)$/i);
  const countryIdx = idx(/^(Buyer Country|Country of Buyer|Country)$/i);
  const productIdx = idx(/^(Sku Id|Product id|Product ID|SKU)$/i);
  const currencyIdx = idx(/^(Currency of Sale|Merchant Currency|Currency)$/i);
  const chargedIdx = idx(/^(Charged Amount|Item Price)$/i);
  const amountIdx = idx(/^(Amount \(Merchant Currency\)|Amount \(Buyer Currency\))$/i);
  const taxIdx = idx(/^(Taxes Collected|Tax Type|Tax)$/i);
  const feeIdx = idx(/^(Google fee|Service Fee|Play fee)$/i);
  const typeIdx = idx(/^(Transaction Type|Financial Status|Description)$/i);
  const grouped = new Map<string, PlayFinanceRow>();
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const date = playDate(cols[dateIdx] ?? "") ?? null;
    if (!date) continue;
    const currency = (cols[currencyIdx] ?? "USD").trim() || "USD";
    const productId = (cols[productIdx] ?? "").trim() || null;
    const country = (cols[countryIdx] ?? "").trim() || null;
    const charged = moneyCell(cols[chargedIdx] ?? "");
    const amount = moneyCell(cols[amountIdx] ?? "");
    const taxes = moneyCell(cols[taxIdx] ?? "");
    const fees = moneyCell(cols[feeIdx] ?? "");
    const label = `${cols[typeIdx] ?? ""}`.toLowerCase();
    const isRefund = /refund|chargeback|return/.test(label) || charged < 0 || amount < 0;
    const gross = Math.abs(charged || amount);
    const proceeds = amount !== 0 ? amount : charged - taxes - fees;
    const key = `${date}|${country ?? ""}|${productId ?? ""}|${currency}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        periodStart: date,
        periodEnd: date,
        country,
        productId,
        currency,
        grossBillings: 0,
        refunds: 0,
        taxes: 0,
        platformFees: 0,
        proceeds: 0,
        settlementCurrency: currency,
        settlementAmount: 0,
        sourceStatement,
      });
    }
    const current = grouped.get(key)!;
    if (isRefund) current.refunds += gross;
    else current.grossBillings += gross;
    current.taxes += Math.abs(taxes);
    current.platformFees += Math.abs(fees);
    current.proceeds += proceeds;
    current.settlementAmount += proceeds;
  }
  return [...grouped.values()].filter((row) => row.grossBillings || row.refunds || row.proceeds);
}

export function isNewPaidSubscriptionEvent(input: {
  eventType: string;
  environment?: string | null;
  isTrial?: boolean | null;
}): boolean {
  if (input.environment !== "production") return false;
  if (input.isTrial) return false;
  const type = input.eventType.trim().toUpperCase();
  if (type === "TEST" || type === "RESTORE" || type === "TRANSFER") return false;
  return type === "INITIAL_PURCHASE" || type === "NON_RENEWING_PURCHASE";
}
