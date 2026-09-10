export const APP_SKU = "com.proteinquest.app";

/** Known Play developer account IDs already used for GCS report discovery. */
export const PLAY_DEVELOPER_ID_CANDIDATES = [
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
