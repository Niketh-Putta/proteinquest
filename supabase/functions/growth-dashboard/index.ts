import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsResponse, json, verifyAdminToken } from "../_shared/admin.ts";
import { ANALYTICS_START_DATE } from "../_shared/growth-events.ts";

const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

type Status = "ok" | "no_data" | "not_connected" | "unavailable";
type Metric = { status: Status; value: number | null; source?: string; formula?: string; denominator?: unknown; window?: string; last_refresh?: string | null; note?: string; sample_size?: number };

function metric(status: Status, value: number | null, extra: Record<string, unknown> = {}): Metric {
  return { status, value, ...extra };
}
function display(m: Metric) {
  if (m.status === "not_connected") return "Not connected";
  if (m.status === "unavailable") return "Unavailable";
  if (m.status === "no_data" || m.value == null) return "No data";
  return m.value;
}
function parseDate(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}
function londonToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ADMIN_PASSWORD || !SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Dashboard is not configured." }, 503);
  const token = req.headers.get("x-admin-token");
  if (!token || !(await verifyAdminToken(token, ADMIN_PASSWORD))) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const to = parseDate(url.searchParams.get("to"), londonToday());
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = parseDate(url.searchParams.get("from"), fromDefault.toISOString().slice(0, 10));
  const platform = url.searchParams.get("platform") ?? "all";
  const channel = url.searchParams.get("channel") ?? "all";
  const activationWindow = Number(url.searchParams.get("activation_window") ?? 7);
  const paidWindow = Number(url.searchParams.get("paid_window") ?? 30);
  const wantCsv = url.searchParams.get("export") === "csv";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await supabase.rpc("refresh_analytics_rollups");

  const table = async (name: string) => {
    const { data } = await supabase.rpc("growth_table", { p_name: name });
    return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  };

  const connections = await table("source_connections");
  const conn = (name: string) => connections.find((c) => c.provider === name) ?? null;
  const eventFrom = from < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : from;
  const eventsReady = to >= ANALYTICS_START_DATE;
  let rollups = eventsReady ? await table("daily_rollups") : [];
  rollups = rollups.filter((r) => String(r.metric_date) >= eventFrom && String(r.metric_date) <= to);
  if (platform !== "all") rollups = rollups.filter((r) => r.platform === platform);
  if (channel !== "all") rollups = rollups.filter((r) => r.channel === channel);
  const sum = (key: string) => rollups.reduce((a, r) => a + Number(r[key] ?? 0), 0);

  const eventMetric = (key: string, label: string, formula: string): Metric =>
    eventsReady
      ? metric("ok", sum(key), { source: "analytics.daily_rollups", formula, denominator: label, window: `${eventFrom} → ${to}`, last_refresh: new Date().toISOString() })
      : metric("no_data", null, { source: "analytics.events", formula, note: `Collection started ${ANALYTICS_START_DATE}.` });

  const firstOpens = eventMetric("first_opens", "new production install IDs", "distinct first_open");
  const firstMeal = eventMetric("first_meals", "first meal in activation window", `first meal within ${activationWindow}d`);
  const appleOk = ["connected", "verified"].includes(String(conn("app_store_connect")?.status ?? ""));
  const playOk = ["connected", "verified"].includes(String(conn("google_play")?.status ?? ""));
  const storeRows = await table("store_daily_metrics");
  const appleDownloads = appleOk
    ? metric("ok", storeRows.filter((r) => r.platform === "ios").reduce((a, r) => a + Number(r.first_time_downloads ?? 0), 0), { source: "App Store Connect reports" })
    : metric("not_connected", null, { source: "App Store Connect", note: String(conn("app_store_connect")?.notes ?? "") });
  const googleDownloads = playOk
    ? metric("ok", storeRows.filter((r) => r.platform === "android").reduce((a, r) => a + Number(r.acquisitions ?? 0), 0), { source: "Google Play reports" })
    : metric("not_connected", null, { source: "Google Play Console", note: String(conn("google_play")?.notes ?? "") });

  const financials = await table("store_financials");
  const money = (p: string) => {
    const rows = financials.filter((r) => r.platform === p);
    const add = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    if (!rows.length) return { proceeds: metric("not_connected", null, { source: `${p} financial reports` }) };
    return { proceeds: metric("ok", add("proceeds"), { source: "store_financials" }) };
  };
  const appleMoney = money("ios");
  const googleMoney = money("android");
  const netProceeds = appleMoney.proceeds.status === "ok" || googleMoney.proceeds.status === "ok"
    ? metric("ok", Number(appleMoney.proceeds.value ?? 0) + Number(googleMoney.proceeds.value ?? 0), { source: "Apple + Google statements" })
    : metric("not_connected", null, { source: "Apple + Google financial reports", note: "No official statement imported." });

  const subEvents = await table("subscription_events");
  const paidUsers = new Set(subEvents.filter((e) => e.environment === "production" && e.is_trial !== true).map((e) => e.user_id).filter(Boolean));
  const newPaid = subEvents.length
    ? metric("ok", paidUsers.size, { source: "analytics.subscription_events", window: `${paidWindow}d` })
    : metric("not_connected", null, { source: "RevenueCat / store notifications", note: "Not store-reconciled. profiles.is_premium is not used." });

  const retention = await table("cohort_retention");
  const retain = (days: 1 | 7 | 30): Metric => {
    const rows = retention.filter((r) => r[`matured_d${days}`]);
    const size = rows.reduce((a, r) => a + Number(r.cohort_size ?? 0), 0);
    const returned = rows.reduce((a, r) => a + Number(r[`returned_d${days}`] ?? 0), 0);
    if (!rows.length) return metric("no_data", null, { source: "analytics.cohort_retention", note: "Incomplete cohorts excluded." });
    return metric("ok", size ? returned / size : 0, { source: "analytics.cohort_retention", denominator: size, sample_size: size });
  };

  const attempts = sum("meal_scans_started") || (sum("meal_scans_succeeded") + sum("meal_scans_failed"));
  const scanFail = !eventsReady || !attempts
    ? metric("no_data", null, { source: "analytics.events", formula: "failed / attempts" })
    : metric("ok", sum("meal_scans_failed") / attempts, { source: "analytics.events", denominator: attempts });

  const websiteVisitors = eventMetric("website_visitors", "consented website IDs", "landing_viewed");
  const storeClicks = eventMetric("store_clicks", "store clickers", "store_link_clicked");
  const funnel = [
    { id: "website_visitors", label: "Website visitors", metric: websiteVisitors },
    { id: "store_clicks", label: "Store clickers", metric: storeClicks },
    { id: "apple_downloads", label: "Apple first-time downloads", metric: appleDownloads },
    { id: "google_downloads", label: "Google first-time acquisitions", metric: googleDownloads },
    { id: "first_opens", label: "First opens", metric: firstOpens },
    { id: "onboarding_started", label: "Onboarding started", metric: eventMetric("onboarding_started", "started", "onboarding_started") },
    { id: "onboarding_completed", label: "Onboarding completed", metric: eventMetric("onboarding_completed", "completed", "onboarding_completed") },
    { id: "accounts", label: "Accounts / sign-in", metric: eventMetric("accounts_created", "new accounts", "account_created") },
    { id: "first_meal", label: "First meal logged", metric: firstMeal },
    { id: "paywall", label: "Paywall viewed", metric: eventMetric("paywall_views", "paywall", "paywall_viewed") },
    { id: "paid", label: "New paid subscribers", metric: newPaid },
  ];

  const evidenced = funnel.filter((s) => s.metric.status === "ok" && typeof s.metric.value === "number");
  let largestLoss = { from: "Unavailable", to: "Unavailable", drop: null as number | null, note: "Need two adjacent connected steps with real counts." };
  for (let i = 0; i < evidenced.length - 1; i += 1) {
    const av = Number(evidenced[i].metric.value);
    const bv = Number(evidenced[i + 1].metric.value);
    if (av <= 0) continue;
    const drop = (av - bv) / av;
    if (largestLoss.drop == null || drop > largestLoss.drop) {
      largestLoss = { from: evidenced[i].label, to: evidenced[i + 1].label, drop, note: `n=${av} → ${bv} in ${from} to ${to}.` };
    }
  }

  const snapshot = {
    meta: { timezone: "Europe/London", from, to, platform, channel, activation_window_days: activationWindow, paid_window_days: paidWindow, analytics_start_date: ANALYTICS_START_DATE, generated_at: new Date().toISOString() },
    connections: connections.map((c) => ({ ...c, credentials_visible: false })),
    overview: {
      first_opens: firstOpens,
      first_meal_activation: firstMeal,
      new_paid_subscribers: newPaid,
      net_proceeds: netProceeds,
      largest_loss: largestLoss,
      growth_action: largestLoss.drop == null
        ? { action: "Connect store reports and wait for live events. Advice needs an evidenced drop.", sample_size: 0, window: `${from} → ${to}`, step: null }
        : { action: `Focus ${largestLoss.from} → ${largestLoss.to}.`, sample_size: Number(evidenced[0]?.metric.value ?? 0), window: `${from} → ${to}`, step: largestLoss.to },
    },
    funnel,
    acquisition: {
      website_visitors: websiteVisitors,
      store_clicks: storeClicks,
      apple_downloads: appleDownloads,
      google_downloads: googleDownloads,
      unknown_channel: metric("ok", sum("first_opens"), { source: "empty channel → Unknown", note: "No fabricated click-to-install." }),
      attribution_coverage: metric("unavailable", null, { source: "No MMP configured" }),
      cac: metric("unavailable", null, { source: "No confirmed paid ads" }),
    },
    retention: { d1: retain(1), d7: retain(7), d30: retain(30), definition: "Returning to scan or log a meal. Immature cohorts excluded." },
    revenue: { apple: appleMoney, google: googleMoney, shared: { ai: metric("no_data", null, { source: "analyze-food estimates" }) } },
    quality: { scan_failure_rate: scanFail },
    definitions: funnel.map((s) => ({ id: s.id, ...s.metric })),
  };

  if (wantCsv) {
    const lines = [
      "metric,display,status,value,source,from,to,platform,channel,timezone,generated_at",
      ...funnel.map((step) => [step.id, JSON.stringify(display(step.metric)), step.metric.status, step.metric.value ?? "", JSON.stringify(String(step.metric.source ?? "")), from, to, platform, channel, "Europe/London", snapshot.meta.generated_at].join(",")),
    ];
    return new Response(lines.join("\n"), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="proteinquest-growth-${from}-${to}.csv"`, "Cache-Control": "no-store" } });
  }
  return json(snapshot);
});
