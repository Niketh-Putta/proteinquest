import { createSign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import {
  APPLE_FINANCE_REGIONS,
  APPLE_FINANCE_REPORT_TYPES,
  monthKeys,
  parseAppleFinanceRows,
  parseAppleSalesUnits,
  type AppleFinanceRow,
} from "./apple-reports";
import {
  APP_SKU,
  isPlayFinancialObject,
  isPlayOverviewObject,
  parsePlayFinanceCsv,
  parsePlayOverviewCsv,
  playBucketCandidates,
  unzipCsvBuffers,
} from "./play-reports";

function admin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function mark(
  provider: string,
  status: "connected" | "error" | "requires_owner_access" | "not_connected",
  error: string | null,
  notes?: string,
) {
  const client = admin();
  await client.rpc("growth_mark_connection", {
    p_provider: provider,
    p_status: status,
    p_error: error,
    p_notes: notes ?? null,
  });
}

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function appleJwt() {
  const keyId = process.env.ASC_KEY_ID || process.env.EXPO_ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID || process.env.EXPO_ASC_ISSUER_ID;
  const privateKey = process.env.ASC_KEY_P8?.replace(/\\n/g, "\n");
  if (!keyId || !issuerId || !privateKey) return null;
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 60 * 15, aud: "appstoreconnect-v1" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

function sandboxRow(row: Record<string, string>) {
  return Object.values(row).some((value) => String(value).toLowerCase().includes("sandbox"));
}

function parseReportTsv(buf: Buffer) {
  const lines = gunzipSync(buf).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [] as Record<string, string>[];
  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cols[i] ?? "";
    });
    return row;
  });
}

function reportDate(row: Record<string, string>) {
  const value = String(row.Date ?? row["Event Date"] ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function appleGet(token: string, path: string) {
  const url = path.startsWith("http") ? path : `https://api.appstoreconnect.apple.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id: string; attributes?: Record<string, string> }[];
    links?: { next?: string };
  };
  if (!res.ok) throw new Error(`ASC ${res.status} ${path}`);
  return json;
}

async function applePages(token: string, path: string) {
  const items: { id: string; attributes?: Record<string, string> }[] = [];
  let next: string | null = path;
  while (next) {
    const json = await appleGet(token, next);
    items.push(...(json.data ?? []));
    next = json.links?.next ?? null;
  }
  return items;
}

async function latestRowsByDate(token: string, reportId: string) {
  const instances = await applePages(
    token,
    `/v1/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&limit=200`,
  );
  instances.sort((a, b) => String(a.attributes?.processingDate).localeCompare(String(b.attributes?.processingDate)));
  const latest = new Map<string, { processingDate: string; rows: Record<string, string>[] }>();
  for (const instance of instances) {
    const processingDate = instance.attributes?.processingDate ?? "";
    const segments = await applePages(token, `/v1/analyticsReportInstances/${instance.id}/segments?limit=200`);
    for (const segment of segments) {
      const url = segment.attributes?.url;
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ASC segment ${res.status}`);
      for (const row of parseReportTsv(Buffer.from(await res.arrayBuffer()))) {
        if (sandboxRow(row)) continue;
        const date = reportDate(row);
        if (!date) continue;
        const current = latest.get(date);
        if (!current || processingDate > current.processingDate) {
          latest.set(date, { processingDate, rows: [row] });
        } else if (processingDate === current.processingDate) {
          current.rows.push(row);
        }
      }
    }
  }
  return [...latest.values()].flatMap((entry) => entry.rows);
}

async function importAppleAnalytics(token: string) {
  const requestId = process.env.APPLE_ANALYTICS_REQUEST_ID?.trim() || "a447d9b5-3d65-4e0b-bc68-3fdd6ff3330d";
  const reports = await applePages(token, `/v1/analyticsReportRequests/${requestId}/reports?limit=200`);
  const byName = new Map(reports.map((report) => [String(report.attributes?.name ?? ""), report.id]));
  const downloadsId = byName.get("App Downloads Standard");
  const engagementId = byName.get("App Store Discovery and Engagement Standard");
  if (!downloadsId && !engagementId) {
    throw new Error("Apple Analytics Standard reports were not found on the ongoing request.");
  }

  const daily = new Map<
    string,
    { date: string; country: string | null; first: number; redo: number; impressions: number; pages: number }
  >();
  const bump = (date: string, country: string | null, field: "first" | "redo" | "impressions" | "pages", n: number) => {
    const key = `${date}|${country ?? ""}`;
    if (!daily.has(key)) daily.set(key, { date, country, first: 0, redo: 0, impressions: 0, pages: 0 });
    daily.get(key)![field] += n;
  };

  if (downloadsId) {
    for (const row of await latestRowsByDate(token, downloadsId)) {
      const date = reportDate(row);
      if (!date) continue;
      const type = String(row["Download Type"] ?? "").toLowerCase();
      const n = Number.parseInt(row.Counts || "0", 10) || 0;
      const country = String(row.Territory || "").trim() || null;
      if (type.includes("first-time") || type.includes("first time")) bump(date, country, "first", n);
      else if (type.includes("redownload")) bump(date, country, "redo", n);
    }
  }
  if (engagementId) {
    for (const row of await latestRowsByDate(token, engagementId)) {
      const date = reportDate(row);
      if (!date) continue;
      const event = String(row.Event ?? "").toLowerCase();
      const pageType = String(row["Page Type"] ?? "").toLowerCase();
      const n = Number.parseInt(row.Counts || "0", 10) || 0;
      const country = String(row.Territory || "").trim() || null;
      if (event.includes("impression")) bump(date, country, "impressions", n);
      if (event.includes("page view") && pageType.includes("product")) bump(date, country, "pages", n);
    }
  }

  const client = admin();
  let inserted = 0;
  for (const row of daily.values()) {
    const { error } = await client.rpc("growth_insert_store_daily", {
      p_platform: "ios",
      p_metric_date: row.date,
      p_country: row.country,
      p_source: "asc_analytics_standard",
      p_first_time_downloads: row.first,
      p_acquisitions: null,
      p_impressions: row.impressions,
      p_product_page_views: row.pages,
      p_redownloads: row.redo,
      p_reinstalls: null,
    });
    if (!error) inserted += 1;
  }
  const dates = [...daily.values()].map((row) => row.date).sort();
  return {
    inserted,
    range: dates.length ? `${dates[0]} to ${dates.at(-1)}` : null,
  };
}

function parseTsvTable(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cols[i] ?? "";
    });
    return row;
  });
}

async function appleGzipReport(token: string, url: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/a-gzip",
    },
  });
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status === 404) return { status: 404, rows: [] as Record<string, string>[] };
  if (!res.ok) {
    const preview = body.toString("utf8").slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`ASC ${res.status} ${preview}`);
  }
  return { status: res.status, rows: parseTsvTable(gunzipSync(body).toString("utf8")) };
}

async function insertAppleFinance(client: ReturnType<typeof admin>, platform: string, row: AppleFinanceRow) {
  const { error } = await client.rpc("growth_insert_store_financial", {
    p_platform: platform,
    p_period_start: row.periodStart,
    p_period_end: row.periodEnd,
    p_country: row.country,
    p_product_id: row.productId,
    p_currency: row.currency,
    p_gross_billings: row.grossBillings,
    p_refunds: row.refunds,
    p_taxes: row.taxes,
    p_platform_fees: row.platformFees,
    p_proceeds: row.proceeds,
    p_settlement_currency: row.settlementCurrency,
    p_settlement_amount: row.settlementAmount,
    p_source_statement: row.sourceStatement,
  });
  return !error;
}

async function importAppleSales(token: string, vendor: string) {
  const client = admin();
  let inserted = 0;
  let financeInserted = 0;
  let monthsTried = 0;
  let lastStatus = 0;
  for (const month of monthKeys(6)) {
    monthsTried += 1;
    const q = new URLSearchParams({
      "filter[frequency]": "MONTHLY",
      "filter[reportDate]": month,
      "filter[reportSubType]": "SUMMARY",
      "filter[reportType]": "SALES",
      "filter[vendorNumber]": vendor,
      "filter[version]": "1_0",
    });
    const { status, rows } = await appleGzipReport(token, `https://api.appstoreconnect.apple.com/v1/salesReports?${q}`);
    lastStatus = status;
    if (status === 404) continue;
    for (const unit of parseAppleSalesUnits(rows, month)) {
      const { error } = await client.rpc("growth_insert_store_daily", {
        p_platform: "ios",
        p_metric_date: unit.date,
        p_country: unit.country,
        p_source: "app_store_connect_sales",
        p_first_time_downloads: unit.units,
        p_acquisitions: null,
        p_reinstalls: null,
      });
      if (!error) inserted += 1;
    }
    for (const money of parseAppleFinanceRows(rows, month, "app_store_connect_sales")) {
      if (await insertAppleFinance(client, "ios", money)) financeInserted += 1;
    }
  }
  return { inserted, financeInserted, monthsTried, lastStatus };
}

async function importAppleFinance(token: string, vendor: string) {
  const client = admin();
  let inserted = 0;
  let files = 0;
  let lastStatus = 0;
  const skipRegions = new Set<string>();
  for (const month of monthKeys(12)) {
    for (const reportType of APPLE_FINANCE_REPORT_TYPES) {
      for (const region of APPLE_FINANCE_REGIONS) {
        if (skipRegions.has(`${reportType}:${region}`)) continue;
        const q = new URLSearchParams({
          "filter[regionCode]": region,
          "filter[reportDate]": month,
          "filter[reportType]": reportType,
          "filter[vendorNumber]": vendor,
        });
        let status = 0;
        let rows: Record<string, string>[] = [];
        try {
          const got = await appleGzipReport(
            token,
            `https://api.appstoreconnect.apple.com/v1/financeReports?${q}`,
          );
          status = got.status;
          rows = got.rows;
        } catch (error) {
          const message = String(error);
          lastStatus = /ASC (\d+)/.exec(message)?.[1] ? Number(/ASC (\d+)/.exec(message)![1]) : 400;
          if (/invalid vendor/i.test(message)) throw new Error(message);
          if (/invalid.*region|regionCode/i.test(message)) skipRegions.add(`${reportType}:${region}`);
          continue;
        }
        lastStatus = status;
        if (status === 404 || !rows.length) continue;
        files += 1;
        for (const row of parseAppleFinanceRows(rows, month, "app_store_connect_financial")) {
          if (await insertAppleFinance(client, "ios", row)) inserted += 1;
        }
      }
    }
  }
  return { inserted, files, lastStatus };
}

async function importApple() {
  const token = await appleJwt();
  if (!token) {
    await mark(
      "app_store_connect",
      "requires_owner_access",
      "Missing ASC_KEY_P8, ASC_KEY_ID or ASC_ISSUER_ID.",
      "Importer ready. Add App Store Connect API secrets to the dashboard deployment.",
    );
    return { provider: "app_store_connect", status: "requires_owner_access" };
  }

  const analytics = await importAppleAnalytics(token);
  const vendor = process.env.APPLE_VENDOR_NUMBER?.trim();
  let salesNote = "Sales/Trends skipped. APPLE_VENDOR_NUMBER is not on this deployment.";
  let financeNote = "Finance reports skipped. APPLE_VENDOR_NUMBER is not on this deployment.";
  let salesError: string | null = null;
  if (vendor) {
    try {
      const sales = await importAppleSales(token, vendor);
      salesNote = `Sales/Trends monthly units imported ${sales.inserted} rows across ${sales.monthsTried} months (last HTTP ${sales.lastStatus}). SKU proteinquest + bundle. Sales IAP proceeds stored ${sales.financeInserted} row(s). Not a fiscal statement.`;
    } catch (error) {
      salesError = String(error).slice(0, 180);
      salesNote = `Sales/Trends failed: ${salesError}`;
    }
    try {
      const finance = await importAppleFinance(token, vendor);
      financeNote = finance.inserted
        ? `Official finance files stored ${finance.inserted} statement rows from ${finance.files} file(s). Not independently verified.`
        : `Finance API called. No statement rows stored (last HTTP ${finance.lastStatus}). Empty is not a reconciled 0.`;
    } catch (error) {
      financeNote = `Finance import failed: ${String(error).slice(0, 180)}`;
    }
  }
  await mark(
    "app_store_connect",
    "connected",
    salesError,
    `Apple Analytics Standard connected. Imported ${analytics.inserted} official daily rows${analytics.range ? ` ${analytics.range}` : ""}. ${salesNote} ${financeNote} Purchases Standard is not a financial statement. Not verified.`,
  );
  return { provider: "app_store_connect", status: "connected" as const, inserted: analytics.inserted };
}

type PlayServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id?: string;
};

function playServiceAccount(): PlayServiceAccount | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  return JSON.parse(raw) as PlayServiceAccount;
}

async function googleToken(sa: PlayServiceAccount, scopes: string[]) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(" "),
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const jwt = `${unsigned}.${sign.sign(sa.private_key, "base64url")}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  return json.access_token ?? null;
}

async function listPlayObjects(token: string, bucket: string, prefix: string) {
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&maxResults=200`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  return { listRes, bucket };
}

async function listPlayOverview(token: string, bucket: string) {
  return listPlayObjects(token, bucket, `stats/installs/installs_${APP_SKU}_`);
}

async function playPublisherOk(sa: PlayServiceAccount) {
  const token = await googleToken(sa, ["https://www.googleapis.com/auth/androidpublisher"]);
  if (!token) return { ok: false, status: 0 };
  const res = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_SKU}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return { ok: res.ok, status: res.status };
}

async function discoverPlayBuckets(sa: PlayServiceAccount, known: string[]) {
  const extra: string[] = [];
  if (!sa.project_id) return extra;
  const token = await googleToken(sa, ["https://www.googleapis.com/auth/cloud-platform"]);
  if (!token) return extra;
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(sa.project_id)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return extra;
  const json = (await res.json()) as { items?: { name?: string }[] };
  for (const item of json.items ?? []) {
    const name = item.name ?? "";
    if (name.includes("pubsite") && !known.includes(name)) extra.push(name);
  }
  return extra;
}

async function importPlay() {
  const sa = playServiceAccount();
  if (!sa) {
    await mark(
      "google_play",
      "requires_owner_access",
      "Missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.",
      "Importer ready. GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is a Vercel Production secret and cannot be read via env pull.",
    );
    return { provider: "google_play", status: "requires_owner_access" };
  }

  const token = await googleToken(sa, ["https://www.googleapis.com/auth/devstorage.read_only"]);
  if (!token) {
    await mark(
      "google_play",
      "requires_owner_access",
      "Play service account token failed.",
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is present but Google token exchange failed.",
    );
    return { provider: "google_play", status: "requires_owner_access" };
  }

  const candidates = playBucketCandidates(
    process.env.GOOGLE_PLAY_DEVELOPER_ID,
    process.env.GOOGLE_PLAY_GCS_BUCKET,
  );
  const discovered = await discoverPlayBuckets(sa, candidates);
  const allBuckets = [...candidates, ...discovered];
  let bucket: string | null = null;
  let objects: { name: string }[] = [];
  const probe: string[] = [];
  for (const candidate of allBuckets) {
    const { listRes } = await listPlayOverview(token, candidate);
    probe.push(`${candidate}=${listRes.status}`);
    if (!listRes.ok) continue;
    const list = (await listRes.json()) as { items?: { name: string }[] };
    const found = (list.items ?? []).filter((o) => o.name && isPlayOverviewObject(o.name));
    bucket = candidate;
    objects = found;
    if (found.length) break;
  }

  if (!bucket) {
    const publisher = await playPublisherOk(sa);
    const saw404 = probe.some((row) => row.endsWith("=404"));
    const saw403 = probe.some((row) => row.endsWith("=403"));
    const note = saw403
      ? `Bucket exists but this reporting account cannot list objects. Grant Download reports to ${sa.client_email}.`
      : saw404
        ? `Report bucket missing (${probe.slice(0, 6).join("; ")}). Accept Play Console Download reports terms so pubsite_prod_rev_${process.env.GOOGLE_PLAY_DEVELOPER_ID ?? "id"} is created, then add ${sa.client_email}.`
        : `GCS list failed (${probe.slice(0, 3).join("; ") || "no candidates"}).`;
    await mark(
      "google_play",
      "requires_owner_access",
      probe[0] ?? "GCS empty",
      `${note} Play Developer API ${publisher.status || "n/a"}. Financial statements stay not connected.`,
    );
    return { provider: "google_play", status: "requires_owner_access" };
  }

  if (!objects.length) {
    await mark(
      "google_play",
      "not_connected",
      null,
      `Play bucket ${bucket} reachable. No install overview CSV yet, so Play stays not connected. Financial statements stay not connected. License testers cannot be stripped from aggregate CSVs.`,
    );
    return { provider: "google_play", status: "not_connected", inserted: 0, bucket };
  }

  const client = admin();
  let inserted = 0;
  const names: string[] = [];
  for (const object of objects.sort((a, b) => a.name.localeCompare(b.name))) {
    const media = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object.name)}?alt=media`;
    const csvRes = await fetch(media, { headers: { Authorization: `Bearer ${token}` } });
    if (!csvRes.ok) {
      await mark("google_play", "error", `GCS download ${csvRes.status}`);
      return { provider: "google_play", status: "error" };
    }
    const csv = Buffer.from(await csvRes.arrayBuffer());
    names.push(object.name);
    for (const row of parsePlayOverviewCsv(csv)) {
      const { error } = await client.rpc("growth_insert_store_daily", {
        p_platform: "android",
        p_metric_date: row.date,
        p_country: null,
        p_source: "play_installs_overview",
        p_first_time_downloads: null,
        p_acquisitions: row.acquisitions,
        p_reinstalls: row.reinstalls,
      });
      if (!error) inserted += 1;
    }
  }
  if (!inserted) {
    await mark(
      "google_play",
      "not_connected",
      null,
      `Play overview CSV downloaded (${names.join(", ")}) but no Daily User Installs rows parsed. Not connected.`,
    );
    return { provider: "google_play", status: "not_connected", inserted: 0, bucket };
  }
  let financeInserted = 0;
  const financeNames: string[] = [];
  for (const prefix of ["earnings/", "sales/", "financials/"]) {
    const listed = await listPlayObjects(token, bucket, prefix);
    if (!listed.listRes.ok) continue;
    const list = (await listed.listRes.json()) as { items?: { name: string }[] };
    for (const object of (list.items ?? []).filter((o) => o.name && isPlayFinancialObject(o.name))) {
      const media = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object.name)}?alt=media`;
      const fileRes = await fetch(media, { headers: { Authorization: `Bearer ${token}` } });
      if (!fileRes.ok) continue;
      financeNames.push(object.name);
      const body = Buffer.from(await fileRes.arrayBuffer());
      let csvs: Buffer[] = [];
      try {
        csvs = unzipCsvBuffers(body);
      } catch {
        continue;
      }
      for (const csv of csvs) {
        for (const row of parsePlayFinanceCsv(csv, `play_${object.name}`)) {
          const { error } = await client.rpc("growth_insert_store_financial", {
            p_platform: "android",
            p_period_start: row.periodStart,
            p_period_end: row.periodEnd,
            p_country: row.country,
            p_product_id: row.productId,
            p_currency: row.currency,
            p_gross_billings: row.grossBillings,
            p_refunds: row.refunds,
            p_taxes: row.taxes,
            p_platform_fees: row.platformFees,
            p_proceeds: row.proceeds,
            p_settlement_currency: row.settlementCurrency,
            p_settlement_amount: row.settlementAmount,
            p_source_statement: row.sourceStatement,
          });
          if (!error) financeInserted += 1;
        }
      }
    }
  }
  const financeNote = financeInserted
    ? `Official Play earnings/sales files stored ${financeInserted} statement row(s) from ${financeNames.length} file(s). Not independently verified.`
    : "Play financial files not found in earnings/sales prefixes. Open Download reports → Financial and accept terms. Empty is not a reconciled 0.";
  await mark(
    "google_play",
    "connected",
    null,
    `Imported ${inserted} Play Daily User Installs / reinstall rows from ${names.length} overview CSV(s). Native Play acquisitions, not Apple first-time downloads. ${financeNote}`,
  );
  return { provider: "google_play", status: "connected", inserted, bucket, financeInserted };
}

async function importFx() {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=GBP");
  if (!res.ok) {
    await mark("fx", "error", `Frankfurter ${res.status}`);
    return { provider: "fx", status: "error" };
  }
  const json = (await res.json()) as { date: string; rates: { GBP: number } };
  const client = admin();
  await client.rpc("growth_upsert_fx", {
    p_rate_date: json.date,
    p_source: "frankfurter",
    p_base: "USD",
    p_quote: "GBP",
    p_rate: json.rates.GBP,
  });
  await mark("fx", "connected", null, `ECB/Frankfurter USDGBP ${json.rates.GBP} on ${json.date}.`);
  return { provider: "fx", status: "connected" };
}

export async function runImports() {
  const results = [];
  results.push(await importApple().catch(async (error) => {
    await mark("app_store_connect", "error", String(error));
    return { provider: "app_store_connect", status: "error" };
  }));
  results.push(await importPlay().catch(async (error) => {
    await mark("google_play", "error", String(error));
    return { provider: "google_play", status: "error" };
  }));
  results.push(await importFx().catch(async (error) => {
    await mark("fx", "error", String(error));
    return { provider: "fx", status: "error" };
  }));
  return { ran_at: new Date().toISOString(), results };
}
