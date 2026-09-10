import { createSign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const APP_SKU = "com.proteinquest.app";

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
  status: "connected" | "error" | "requires_owner_access",
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
    });
    if (!error) inserted += 1;
  }
  const dates = [...daily.values()].map((row) => row.date).sort();
  await mark(
    "app_store_connect",
    "connected",
    null,
    `Apple Analytics Standard connected. Imported ${inserted} official daily rows${dates.length ? ` ${dates[0]} to ${dates.at(-1)}` : ""}. Purchases Standard is not a financial statement. Sales/Trends still need vendor number. Not verified.`,
  );
  return { provider: "app_store_connect", status: "connected" as const, inserted };
}

async function importAppleSales(token: string, vendor: string) {
  const now = new Date();
  const reportDateMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const q = new URLSearchParams({
    "filter[frequency]": "MONTHLY",
    "filter[reportDate]": reportDateMonth,
    "filter[reportSubType]": "SUMMARY",
    "filter[reportType]": "SALES",
    "filter[vendorNumber]": vendor,
    "filter[version]": "1_0",
  });
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`Apple sales ${res.status}`);
  const tsv = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  const lines = tsv.trim().split("\n");
  const headers = lines[0]?.split("\t") ?? [];
  const unitsIdx = headers.indexOf("Units");
  const typeIdx = headers.indexOf("Product Type Identifier");
  const skuIdx = headers.indexOf("SKU");
  const dateIdx = headers.indexOf("Begin Date");
  const countryIdx = headers.indexOf("Country Code");
  const downloadTypes = new Set(["1", "1F", "1T", "1-B", "1E", "1EP", "F1"]);
  const client = admin();
  let inserted = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const type = cols[typeIdx] ?? "";
    const sku = cols[skuIdx] ?? "";
    if (sku && sku !== APP_SKU) continue;
    if (!downloadTypes.has(type)) continue;
    const units = Number.parseFloat(cols[unitsIdx] ?? "0") || 0;
    const rawDate = cols[dateIdx] ?? "";
    const metricDate = rawDate.includes("/") ? rawDate.split("/").reverse().join("-") : `${reportDateMonth}-01`;
    const { error } = await client.rpc("growth_insert_store_daily", {
      p_platform: "ios",
      p_metric_date: metricDate.length === 10 ? metricDate : `${reportDateMonth}-01`,
      p_country: cols[countryIdx] || null,
      p_source: "app_store_connect_sales",
      p_first_time_downloads: Math.max(0, Math.round(units)),
      p_acquisitions: null,
    });
    if (!error) inserted += 1;
  }
  return inserted;
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
  if (vendor) {
    try {
      await importAppleSales(token, vendor);
    } catch {
      // Analytics can stay connected even when Sales/Trends still needs a usable vendor number.
    }
  }
  return analytics;
}

async function googleToken() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; token_uri: string };
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/devstorage.read_only",
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

async function importPlay() {
  const token = await googleToken();
  if (!token) {
    await mark(
      "google_play",
      "requires_owner_access",
      "Missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.",
      "Importer ready. Add Play service account + report bucket.",
    );
    return { provider: "google_play", status: "requires_owner_access" };
  }
  let bucket = process.env.GOOGLE_PLAY_GCS_BUCKET?.trim();
  if (!bucket && process.env.GOOGLE_PLAY_DEVELOPER_ID) {
    bucket = `pubsite_prod_rev_${process.env.GOOGLE_PLAY_DEVELOPER_ID.trim()}`;
  }
  if (!bucket) {
    await mark("google_play", "requires_owner_access", "Set GOOGLE_PLAY_GCS_BUCKET.");
    return { provider: "google_play", status: "requires_owner_access" };
  }
  const prefix = `stats/installs/installs_${APP_SKU}_`;
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&maxResults=20`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) {
    await mark("google_play", "error", `GCS list ${listRes.status}`);
    return { provider: "google_play", status: "error" };
  }
  const list = (await listRes.json()) as { items?: { name: string }[] };
  const object = (list.items ?? []).filter((o) => o.name?.includes("_overview.csv")).sort((a, b) => (a.name < b.name ? 1 : -1))[0];
  if (!object) {
    await mark("google_play", "connected", null, "Play bucket reachable. No overview CSV yet.");
    return { provider: "google_play", status: "connected", inserted: 0 };
  }
  const media = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object.name)}?alt=media`;
  const csvRes = await fetch(media, { headers: { Authorization: `Bearer ${token}` } });
  if (!csvRes.ok) {
    await mark("google_play", "error", `GCS download ${csvRes.status}`);
    return { provider: "google_play", status: "error" };
  }
  const csv = await csvRes.text();
  const rows = csv.trim().split("\n");
  const headers = rows[0]?.split(",").map((h) => h.trim()) ?? [];
  const dateIdx = headers.findIndex((h) => /date/i.test(h));
  const acqIdx = headers.findIndex((h) => h === "Daily User Installs" || h === "User Installs");
  const client = admin();
  let inserted = 0;
  for (const line of rows.slice(1)) {
    const cols = line.split(",").map((c) => c.replace(/"/g, ""));
    const metricDate = cols[dateIdx];
    if (!metricDate || !/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) continue;
    const acquisitions = Number.parseInt(cols[acqIdx] ?? "0", 10) || 0;
    const { error } = await client.rpc("growth_insert_store_daily", {
      p_platform: "android",
      p_metric_date: metricDate,
      p_country: null,
      p_source: "play_installs_overview",
      p_first_time_downloads: null,
      p_acquisitions: acquisitions,
    });
    if (!error) inserted += 1;
  }
  await mark("google_play", "connected", null, `Imported ${inserted} Play install rows from ${object.name}.`);
  return { provider: "google_play", status: "connected", inserted };
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
