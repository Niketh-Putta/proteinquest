import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsResponse, json, verifyAdminToken } from "../_shared/admin.ts";
import { ANALYTICS_START_DATE } from "../_shared/growth-events.ts";

const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

type Status = "ok" | "no_data" | "not_connected" | "unavailable";

function metric(
  status: Status,
  value: number | null,
  extra: Record<string, unknown>,
) {
  return { status, value, ...extra };
}

function display(m: { status: Status; value: number | null }) {
  if (m.status === "not_connected") return "Not connected";
  if (m.status === "unavailable") return "Unavailable";
  if (m.status === "no_data" || m.value == null) return "No data";
  return m.value;
}

function parseDate(value: string | null, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function londonToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!ADMIN_PASSWORD || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Dashboard is not configured." }, 503);
  }

  const token = req.headers.get("x-admin-token");
  if (!token || !(await verifyAdminToken(token, ADMIN_PASSWORD))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const to = parseDate(url.searchParams.get("to"), londonToday());
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = parseDate(
    url.searchParams.get("from"),
    fromDefault.toISOString().slice(0, 10),
  );
  const platform = url.searchParams.get("platform") ?? "all";
  const channel = url.searchParams.get("channel") ?? "all";
  const activationWindow = Number(url.searchParams.get("activation_window") ?? 7);
  const paidWindow = Number(url.searchParams.get("paid_window") ?? 30);
  const wantCsv = url.searchParams.get("export") === "csv";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: stale } = await supabase
    .schema("analytics")
    .from("source_connections")
    .select("last_success_at")
    .eq("provider", "app_events")
    .maybeSingle();

  const lastRollup = stale?.last_success_at
    ? Date.parse(stale.last_success_at)
    : 0;
  if (!lastRollup || Date.now() - lastRollup > 15 * 60 * 1000) {
    await supabase.rpc("refresh_analytics_rollups");
  }

  const connectionsRes = await supabase
    .schema("analytics")
    .from("source_connections")
    .select(
      "provider,status,scopes,data_range_start,data_range_end,last_success_at,last_attempt_at,freshness_seconds,error_summary,notes",
    )
    .order("provider");

  const connections = connectionsRes.data ?? [];
  const conn = (name: string) =>
    connections.find((c) => c.provider === name) ?? null;

  const eventFrom = from < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : from;
  const eventsReady = to >= ANALYTICS_START_DATE;

  let rollups: Record<string, number>[] = [];
  if (eventsReady) {
    let q = supabase
      .schema("analytics")
      .from("daily_rollups")
      .select("*")
      .gte("metric_date", eventFrom)
      .lte("metric_date", to);
    if (platform !== "all") q = q.eq("platform", platform);
    if (channel !== "all") q = q.eq("channel", channel);
    const { data } = await q;
    rollups = (data ?? []) as Record<string, number>[];
  }

  const sum = (key: string) =>
    rollups.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);

  const eventMetric = (key: string, label: string, formula: string) => {
    if (!eventsReady) {
      return metric("no_data", null, {
        source: "analytics.events",
        formula,
        denominator: label,
        window: `${from} → ${to}`,
        last_refresh: new Date().toISOString(),
        note: `Collection started ${ANALYTICS_START_DATE}. Historic values were not invented.`,
      });
    }
    return metric("ok", sum(key), {
      source: "analytics.daily_rollups ← analytics.events",
      formula,
      denominator: label,
      window: `${eventFrom} → ${to}`,
      last_refresh: new Date().toISOString(),
    });
  };

  const firstOpens = eventMetric(
    "first_opens",
    "distinct new production install IDs with first_open",
    "count distinct install_id where event_name=first_open and environment=production and not excluded",
  );

  const onboardingStarted = eventMetric(
    "onboarding_started",
    "installs that started onboarding",
    "count distinct eligible installs with onboarding_started",
  );
  const onboardingCompleted = eventMetric(
    "onboarding_completed",
    "installs that completed onboarding",
    "completed / started in period",
  );

  const { count: signedIn } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("onboarded", true);

  const { data: excludedUsers } = await supabase
    .schema("analytics")
    .from("exclusions")
    .select("user_id")
    .not("user_id", "is", null);
  const excluded = new Set(
    (excludedUsers ?? []).map((r) => r.user_id).filter(Boolean),
  );

  const { count: mealUsers } = await supabase
    .from("protein_logs")
    .select("user_id", { count: "exact", head: true });

  const { data: premiumRows } = await supabase
    .from("profiles")
    .select("id,is_premium,created_at")
    .eq("is_premium", true);
  const entitled = (premiumRows ?? []).filter((r) => !excluded.has(r.id));

  const { data: storeRows } = await supabase
    .schema("analytics")
    .from("store_daily_metrics")
    .select("*")
    .gte("metric_date", from)
    .lte("metric_date", to);

  const appleStore = (storeRows ?? []).filter((r) => r.platform === "ios");
  const playStore = (storeRows ?? []).filter((r) => r.platform === "android");
  const appleConnected = ["connected", "verified"].includes(
    conn("app_store_connect")?.status ?? "",
  );
  const playConnected = ["connected", "verified"].includes(
    conn("google_play")?.status ?? "",
  );

  const appleDownloads = appleConnected
    ? metric("ok", appleStore.reduce((a, r) => a + Number(r.first_time_downloads ?? 0), 0), {
        source: "App Store Connect sales/app analytics reports",
        formula: "sum first-time downloads (Apple definition)",
        denominator: "official first-time units",
        window: `${from} → ${to}`,
        last_refresh: conn("app_store_connect")?.last_success_at ?? null,
        redownloads: appleStore.reduce((a, r) => a + Number(r.redownloads ?? 0), 0),
      })
    : metric("not_connected", null, {
        source: "App Store Connect",
        formula: "Official first-time downloads",
        note: conn("app_store_connect")?.notes,
        last_refresh: null,
      });

  const googleDownloads = playConnected
    ? metric("ok", playStore.reduce((a, r) => a + Number(r.acquisitions ?? 0), 0), {
        source: "Google Play install reports",
        formula: "sum first-time acquisitions (Google definition)",
        denominator: "official first-time installers",
        window: `${from} → ${to}`,
        last_refresh: conn("google_play")?.last_success_at ?? null,
        reinstalls: playStore.reduce((a, r) => a + Number(r.reinstalls ?? 0), 0),
      })
    : metric("not_connected", null, {
        source: "Google Play Console",
        formula: "Official first-time acquisitions",
        note: conn("google_play")?.notes,
        last_refresh: null,
      });

  const { data: financials } = await supabase
    .schema("analytics")
    .from("store_financials")
    .select("*")
    .lte("period_start", to)
    .gte("period_end", from);

  const money = (platformName: string) => {
    const rows = (financials ?? []).filter((r) => r.platform === platformName);
    if (!rows.length) {
      return {
        gross: metric("not_connected", null, { source: `${platformName} financial reports` }),
        refunds: metric("not_connected", null, { source: `${platformName} financial reports` }),
        taxes: metric("not_connected", null, { source: `${platformName} financial reports` }),
        fees: metric("not_connected", null, { source: `${platformName} financial reports` }),
        proceeds: metric("not_connected", null, { source: `${platformName} financial reports` }),
      };
    }
    const add = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      gross: metric("ok", add("gross_billings"), { source: "store_financials", currency: "original + GBP when FX present" }),
      refunds: metric("ok", add("refunds"), { source: "store_financials" }),
      taxes: metric("ok", add("taxes"), { source: "store_financials" }),
      fees: metric("ok", add("platform_fees"), { source: "store_financials" }),
      proceeds: metric("ok", add("proceeds"), { source: "store_financials" }),
    };
  };

  const appleMoney = money("ios");
  const googleMoney = money("android");

  const { data: subEvents } = await supabase
    .schema("analytics")
    .from("subscription_events")
    .select("event_type,environment,user_id,event_time,is_trial")
    .eq("environment", "production")
    .gte("event_time", `${from}T00:00:00Z`)
    .lte("event_time", `${to}T23:59:59Z`);

  const rcStatus = conn("revenuecat")?.status ?? "requires_owner_access";
  const paidFromBilling = (subEvents ?? []).filter((e) =>
    ["INITIAL_PURCHASE", "RENEWAL", "initial_purchase", "renewal"].includes(
      String(e.event_type),
    ) && e.is_trial !== true
  );
  const newPaid = ["connected", "verified"].includes(rcStatus) || (subEvents ?? []).length
    ? metric("ok", new Set(paidFromBilling.map((e) => e.user_id).filter(Boolean)).size, {
        source: "analytics.subscription_events (RevenueCat / store, production only)",
        formula: "distinct users with first verified paid purchase, excluding trials and restores",
        window: `${paidWindow}d paid conversion window`,
      })
    : metric("not_connected", null, {
        source: "RevenueCat webhook / store notifications",
        note: "Do not treat profiles.is_premium as a paid subscriber.",
      });

  const { data: aiRows } = await supabase
    .schema("analytics")
    .from("ai_usage")
    .select("estimated_cost_usd,status,requested_at")
    .gte("requested_at", `${from}T00:00:00Z`)
    .lte("requested_at", `${to}T23:59:59Z`);

  const aiCost = metric(
    (aiRows ?? []).length ? "ok" : "no_data",
    (aiRows ?? []).reduce((a, r) => a + Number(r.estimated_cost_usd ?? 0), 0) || null,
    {
      source: "analytics.ai_usage from analyze-food (estimate). Official OpenAI invoice not reconciled.",
      formula: "sum estimated_cost_usd using pricing_as_of on the request date",
      success_rate: (aiRows ?? []).length
        ? (aiRows ?? []).filter((r) => r.status === "ok").length / (aiRows ?? []).length
        : null,
    },
  );

  const { data: expenses } = await supabase
    .schema("analytics")
    .from("expenses")
    .select("vendor,category,amount,currency,recurrence,coverage_start,coverage_end,expense_date");

  const { data: retention } = await supabase
    .schema("analytics")
    .from("cohort_retention")
    .select("*")
    .gte("cohort_date", from)
    .lte("cohort_date", to);

  const retain = (days: 1 | 7 | 30) => {
    const maturedKey = `matured_d${days}` as const;
    const returnedKey = `returned_d${days}` as const;
    const rows = (retention ?? []).filter((r) => r[maturedKey]);
    const size = rows.reduce((a, r) => a + Number(r.cohort_size ?? 0), 0);
    const returned = rows.reduce((a, r) => a + Number(r[returnedKey] ?? 0), 0);
    if (!rows.length) {
      return metric("no_data", null, {
        source: "analytics.cohort_retention",
        formula: `returned to scan/log on day ${days} / matured first-open cohort`,
        note: "Incomplete cohorts excluded.",
      });
    }
    return metric("ok", size ? returned / size : 0, {
      source: "analytics.cohort_retention",
      formula: `D${days} meal-return / matured cohort`,
      denominator: size,
      sample_size: size,
      window: `${days} days`,
    });
  };

  const firstMeal = eventMetric(
    "first_meals",
    "first successful meal in activation window",
    `first meal_logged within ${activationWindow} days of account/install`,
  );

  const scanFail = (() => {
    const started = sum("meal_scans_started") + sum("meal_scans_succeeded") +
      sum("meal_scans_failed");
    const failed = sum("meal_scans_failed");
    const attempts = sum("meal_scans_started") || (sum("meal_scans_succeeded") + failed);
    if (!eventsReady) return eventMetric("meal_scans_failed", "failed / attempts", "attempts not users");
    if (!attempts) {
      return metric("no_data", null, {
        source: "analytics.events",
        formula: "failed scan attempts / total scan attempts",
        denominator: "attempts, not users",
      });
    }
    return metric("ok", failed / attempts, {
      source: "analytics.events",
      formula: "failed / attempts",
      denominator: attempts,
    });
  })();

  const websiteVisitors = eventMetric(
    "website_visitors",
    "distinct consented website visitors",
    "distinct install_id for landing_viewed",
  );
  const storeClicks = eventMetric(
    "store_clicks",
    "distinct website visitors clicking a store link",
    "distinct install_id for store_link_clicked",
  );

  const netProceeds = appleMoney.proceeds.status === "ok" ||
      googleMoney.proceeds.status === "ok"
    ? metric("ok", Number(appleMoney.proceeds.value ?? 0) + Number(googleMoney.proceeds.value ?? 0), {
        source: "store_financials Apple + Google. Shared costs not subtracted twice.",
        currency: "GBP when FX available, else original",
      })
    : metric("not_connected", null, {
        source: "Apple + Google financial reports",
        note: "No official statement imported for this period.",
      });

  const funnel = [
    { id: "website_visitors", label: "Website visitors", metric: websiteVisitors },
    { id: "store_clicks", label: "Store clickers", metric: storeClicks },
    { id: "apple_downloads", label: "Apple first-time downloads", metric: appleDownloads },
    { id: "google_downloads", label: "Google first-time acquisitions", metric: googleDownloads },
    { id: "first_opens", label: "First opens", metric: firstOpens },
    { id: "onboarding_started", label: "Onboarding started", metric: onboardingStarted },
    { id: "onboarding_completed", label: "Onboarding completed", metric: onboardingCompleted },
    {
      id: "accounts",
      label: "Accounts / sign-in",
      metric: eventMetric("accounts_created", "new accounts", "account_created events, not repeat sign-in"),
    },
    { id: "first_meal", label: "First meal logged", metric: firstMeal },
    { id: "paywall", label: "Paywall viewed", metric: eventMetric("paywall_views", "eligible users", "paywall_viewed distinct") },
    { id: "paid", label: "New paid subscribers", metric: newPaid },
  ];

  const evidenced = funnel.filter((s) => s.metric.status === "ok" && typeof s.metric.value === "number");
  let largestLoss = {
    from: "Unavailable",
    to: "Unavailable",
    drop: null as number | null,
    note: "Need two adjacent connected steps with real counts.",
  };
  for (let i = 0; i < evidenced.length - 1; i += 1) {
    const a = evidenced[i];
    const b = evidenced[i + 1];
    const av = Number(a.metric.value);
    const bv = Number(b.metric.value);
    if (av <= 0) continue;
    const drop = (av - bv) / av;
    if (largestLoss.drop == null || drop > largestLoss.drop) {
      largestLoss = {
        from: a.label,
        to: b.label,
        drop,
        note: `n=${av} → ${bv} in ${from} to ${to} (Europe/London).`,
      };
    }
  }

  const growthAction = largestLoss.drop == null
    ? {
        action: "Connect store and billing reports, then ship the app event stream. Advice waits on evidenced loss.",
        sample_size: 0,
        window: `${from} → ${to}`,
        step: null,
      }
    : {
        action: `Focus ${largestLoss.from} → ${largestLoss.to}. That is the largest evidenced drop in this window.`,
        sample_size: evidenced[0] ? Number(evidenced[0].metric.value) : 0,
        window: `${from} → ${to}`,
        step: largestLoss.to,
      };

  const snapshot = {
    meta: {
      timezone: "Europe/London",
      storage_timezone: "UTC",
      from,
      to,
      platform,
      channel,
      activation_window_days: activationWindow,
      paid_window_days: paidWindow,
      analytics_start_date: ANALYTICS_START_DATE,
      generated_at: new Date().toISOString(),
      presentation_currency: "GBP",
    },
    connections: connections.map((c) => ({
      ...c,
      credentials_visible: false,
    })),
    overview: {
      first_opens: firstOpens,
      first_meal_activation: firstMeal,
      new_paid_subscribers: newPaid,
      net_proceeds: netProceeds,
      largest_loss: largestLoss,
      growth_action: growthAction,
    },
    funnel,
    acquisition: {
      website_visitors: websiteVisitors,
      store_clicks: storeClicks,
      apple_downloads: appleDownloads,
      google_downloads: googleDownloads,
      unknown_channel: metric("ok", sum("first_opens"), {
        source: "events.channel empty → Unknown",
        note: "Website clicks are not joined to store installs. No fabricated click-to-install.",
      }),
      attribution_coverage: metric("unavailable", null, {
        source: "No MMP configured",
        note: "Apple/Google aggregates cannot prove a visitor installed.",
      }),
      cac: metric("unavailable", null, {
        source: "Paid ads + paying customers",
        note: "No active paid ad account confirmed. CAC hidden until spend and attributed payers exist.",
      }),
    },
    retention: {
      d1: retain(1),
      d7: retain(7),
      d30: retain(30),
      definition: "Returning to scan or log a meal. App-open retention is separate and not shown as the default.",
    },
    revenue: {
      apple: appleMoney,
      google: googleMoney,
      shared: {
        ai: aiCost,
        infrastructure: (expenses ?? []).length
          ? metric("ok", (expenses ?? []).filter((e) => e.category === "infrastructure").reduce((a, e) => a + Number(e.amount), 0), {
              source: "analytics.expenses",
            })
          : metric("not_connected", null, { source: "manual invoices" }),
        apple_membership: metric("not_connected", null, {
          source: "Apple Developer invoice",
          note: "Requires the real invoice. USD 99 is not assumed.",
        }),
        google_registration: metric("not_connected", null, {
          source: "Google Play registration invoice",
          note: "Requires the real invoice. USD 25 is not assumed.",
        }),
      },
      entitled_profiles_unverified: entitled.length,
      entitled_note:
        "profiles.is_premium is entitlement state, including comps. It is not new paid subscribers and is not store-reconciled.",
      derived_onboarded_profiles: signedIn ?? 0,
      derived_meal_log_rows: mealUsers ?? 0,
    },
    quality: {
      scan_failure_rate: scanFail,
    },
    definitions: [
      { id: "website_visitors", ...websiteVisitors },
      { id: "store_clickers", ...storeClicks },
      { id: "apple_downloads", ...appleDownloads },
      { id: "google_downloads", ...googleDownloads },
      { id: "first_opens", ...firstOpens },
      { id: "onboarding_completion", ...onboardingCompleted },
      { id: "first_scan_activation", ...firstMeal },
      { id: "paid_conversion", ...newPaid },
      { id: "retention_d1", ...retain(1) },
      { id: "net_proceeds", ...netProceeds },
    ],
  };

  if (wantCsv) {
    const lines = [
      ["metric", "display", "status", "value", "source", "from", "to", "platform", "channel", "timezone", "generated_at"].join(","),
      ...funnel.map((step) =>
        [
          step.id,
          JSON.stringify(display(step.metric)),
          step.metric.status,
          step.metric.value ?? "",
          JSON.stringify(String((step.metric as { source?: string }).source ?? "")),
          from,
          to,
          platform,
          channel,
          "Europe/London",
          snapshot.meta.generated_at,
        ].join(","),
      ),
    ];
    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="proteinquest-growth-${from}-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return json(snapshot);
});
