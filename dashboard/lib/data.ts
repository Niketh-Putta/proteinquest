import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { displayMetric } from "./format";
import { planMixFromEvents } from "./plan-metrics";
import { isNewPaidSubscriptionEvent } from "./play-reports";
import type { Metric, Status } from "./types";

export type { Metric, Status };
export { displayMetric };

export const ANALYTICS_START_DATE = "2026-09-10";

export type Connection = {
  provider: string;
  status: string;
  scopes: string[];
  last_success_at: string | null;
  last_attempt_at: string | null;
  error_summary: string | null;
  notes: string | null;
};

export type Snapshot = {
  meta: {
    timezone: string;
    from: string;
    to: string;
    platform: string;
    channel: string;
    activation_window_days: number;
    paid_window_days: number;
    analytics_start_date: string;
    generated_at: string;
  };
  connections: Connection[];
  overview: {
    first_opens: Metric;
    first_meal_activation: Metric;
    new_paid_subscribers: Metric;
    estimated_mrr: Metric;
    net_proceeds: Metric;
    largest_loss: { from: string; to: string; drop: number | null; note: string };
    growth_action: { action: string; sample_size: number; window: string; step: string | null };
  };
  funnel: { id: string; label: string; metric: Metric }[];
  acquisition: Record<string, Metric>;
  retention: { d1: Metric; d7: Metric; d30: Metric; definition: string };
  revenue: {
    apple: Record<string, Metric>;
    google: Record<string, Metric>;
    shared: Record<string, Metric>;
    plans: Record<string, Metric>;
  };
  quality: { scan_failure_rate: Metric };
  definitions: (Metric & { id: string })[];
};

function metric(status: Status, value: number | null, extra: Record<string, unknown> = {}): Metric {
  return { status, value, ...extra };
}

function parseDate(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function londonToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function supabaseAdmin(): SupabaseClient | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function table(client: SupabaseClient, name: string) {
  const { data } = await client.rpc("growth_table", { p_name: name });
  return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
}

const loadWarehouse = unstable_cache(
  async () => {
    const client = supabaseAdmin();
    if (!client) {
      return {
        connections: [] as Connection[],
        rollups: [] as Record<string, unknown>[],
        store: [] as Record<string, unknown>[],
        financials: [] as Record<string, unknown>[],
        subEvents: [] as Record<string, unknown>[],
        retention: [] as Record<string, unknown>[],
        expenses: [] as Record<string, unknown>[],
        aiRows: [] as Record<string, unknown>[],
      };
    }
    const [connections, rollups, store, financials, subEvents, retention, expenses, aiRows] = await Promise.all([
      table(client, "source_connections"),
      table(client, "daily_rollups"),
      table(client, "store_daily_metrics"),
      table(client, "store_financials"),
      table(client, "subscription_events"),
      table(client, "cohort_retention"),
      table(client, "expenses"),
      table(client, "ai_usage"),
    ]);
    return {
      connections: connections as Connection[],
      rollups,
      store,
      financials,
      subEvents,
      retention,
      expenses,
      aiRows,
    };
  },
  ["growth-warehouse-v1"],
  { revalidate: 60 },
);

export async function loadConnections(): Promise<Connection[]> {
  return (await loadWarehouse()).connections;
}

export async function loadSnapshot(search: {
  from?: string | null;
  to?: string | null;
  platform?: string | null;
  channel?: string | null;
  activation_window?: string | null;
  paid_window?: string | null;
}): Promise<Snapshot> {
  const to = parseDate(search.to ?? null, londonToday());
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = parseDate(search.from ?? null, fromDefault.toISOString().slice(0, 10));
  const platform = search.platform ?? "all";
  const channel = search.channel ?? "all";
  const activationWindow = Number(search.activation_window ?? 7);
  const paidWindow = Number(search.paid_window ?? 30);
  const generated = new Date().toISOString();

  const client = supabaseAdmin();
  if (!client) {
    const missing = metric("not_connected", null, {
      source: "Supabase service role",
      note: "SUPABASE_SERVICE_ROLE_KEY is not available to this deployment.",
    });
    return emptySnapshot({ from, to, platform, channel, activationWindow, paidWindow, generated }, [], missing);
  }

  const warehouse = await loadWarehouse();
  const connections = warehouse.connections;
  const conn = (name: string) => connections.find((c) => c.provider === name) ?? null;
  const eventFrom = from < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : from;
  const eventsReady = to >= ANALYTICS_START_DATE;
  let rollups = eventsReady ? warehouse.rollups : [];
  rollups = rollups.filter((r) => String(r.metric_date) >= eventFrom && String(r.metric_date) <= to);
  if (platform !== "all") rollups = rollups.filter((r) => r.platform === platform);
  if (channel !== "all") rollups = rollups.filter((r) => r.channel === channel);
  const sum = (key: string) => rollups.reduce((a, r) => a + Number(r[key] ?? 0), 0);

  const eventMetric = (key: string, label: string, formula: string): Metric =>
    eventsReady
      ? metric("ok", sum(key), {
          source: "analytics.daily_rollups",
          formula,
          denominator: label,
          window: `${eventFrom} → ${to}`,
          last_refresh: generated,
        })
      : metric("no_data", null, {
          source: "analytics.events",
          formula,
          note: `Collection started ${ANALYTICS_START_DATE}.`,
        });

  const firstOpens = eventMetric("first_opens", "new production install IDs", "distinct first_open");
  const firstMeal = eventMetric("first_meals", "first meal in activation window", `first meal within ${activationWindow}d`);
  const appleOk = ["connected", "verified"].includes(String(conn("app_store_connect")?.status ?? ""));
  const playOk = ["connected", "verified"].includes(String(conn("google_play")?.status ?? ""));
  const storeRows = warehouse.store.filter(
    (r) => String(r.metric_date) >= from && String(r.metric_date) <= to,
  );
  const appleStore = storeRows.filter((r) => r.platform === "ios");
  const applePreferred = appleStore.filter((r) => r.source === "asc_analytics_standard");
  const appleUse = applePreferred.length ? applePreferred : appleStore;
  const appleDownloads = appleOk
    ? metric("ok", appleUse.reduce((a, r) => a + Number(r.first_time_downloads ?? 0), 0), {
        source: applePreferred.length ? "App Store Connect Analytics Standard" : "App Store Connect sales",
        note: "Analytics Standard preferred over Sales/Trends so units are not double-counted.",
      })
    : metric("not_connected", null, {
        source: "App Store Connect",
        note: String(conn("app_store_connect")?.notes ?? ""),
      });
  const playStore = storeRows.filter((r) => r.platform === "android");
  const playPreferred = playStore.filter((r) => r.source === "play_installs_overview");
  const playUse = playPreferred.length ? playPreferred : playStore;
  const googleDownloads = playOk
    ? metric("ok", playUse.reduce((a, r) => a + Number(r.acquisitions ?? 0), 0), {
        source: "Google Play reports",
      })
    : metric("not_connected", null, {
        source: "Google Play Console",
        note: String(conn("google_play")?.notes ?? ""),
      });

  const financials = warehouse.financials;
  const money = (p: string) => {
    const rows = financials.filter((r) => r.platform === p);
    const add = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    if (!rows.length) {
      return {
        billings: metric("not_connected", null, { source: `${p} financial reports` }),
        refunds: metric("not_connected", null, { source: `${p} financial reports` }),
        taxes: metric("not_connected", null, { source: `${p} financial reports` }),
        fees: metric("not_connected", null, { source: `${p} financial reports` }),
        proceeds: metric("not_connected", null, { source: `${p} financial reports` }),
      };
    }
    return {
      billings: metric("ok", add("gross_billings"), { source: "store_financials", note: "Imported statement rows. Not independently verified." }),
      refunds: metric("ok", add("refunds"), { source: "store_financials", note: "Imported statement rows. Not independently verified." }),
      taxes: metric("ok", add("taxes"), { source: "store_financials", note: "Imported statement rows. Not independently verified." }),
      fees: metric("ok", add("platform_fees"), { source: "store_financials", note: "Commission is only shown when the file itemizes it." }),
      proceeds: metric("ok", add("proceeds"), {
        source: "store_financials",
        note: "Official Apple/Google rows. Sales/Trends proceeds are not a fiscal settlement statement. Not independently verified.",
      }),
    };
  };
  const appleMoney = money("ios");
  const googleMoney = money("android");
  const netProceeds =
    appleMoney.proceeds.status === "ok" || googleMoney.proceeds.status === "ok"
      ? metric("ok", Number(appleMoney.proceeds.value ?? 0) + Number(googleMoney.proceeds.value ?? 0), {
          source: "Apple + Google statements",
        })
      : metric("not_connected", null, {
          source: "Apple + Google financial reports",
          note: "No official statement imported.",
        });

  const subEvents = warehouse.subEvents;
  const paidUsers = new Set(
    subEvents
      .filter((e) =>
        isNewPaidSubscriptionEvent({
          eventType: String(e.event_type ?? ""),
          environment: String(e.environment ?? ""),
          isTrial: e.is_trial === true,
        }),
      )
      .map((e) => e.user_id)
      .filter(Boolean),
  );
  const rcReady = ["connected", "verified"].includes(String(conn("revenuecat")?.status ?? ""));
  const mix = planMixFromEvents(subEvents, { from, to });
  const planNote =
    "List-price estimate from RevenueCat production events. £9.99/mo and £29.99/yr. Weekly uses £6.99 if that SKU appears. Not store proceeds.";
  const planMetric = (value: number, formula: string, unit?: "gbp" | "count"): Metric =>
    rcReady || subEvents.length
      ? metric("ok", value, {
          source: "analytics.subscription_events",
          formula,
          note: planNote,
          unit,
        })
      : metric("not_connected", null, { source: "RevenueCat", note: planNote });
  const newPaid = rcReady || subEvents.length
    ? metric("ok", paidUsers.size, { source: "analytics.subscription_events", window: `${paidWindow}d` })
    : metric("not_connected", null, {
        source: "RevenueCat / store notifications",
        note: "Not store-reconciled. profiles.is_premium is not used.",
      });
  const estimatedMrr = planMetric(mix.mrr, "active weekly/monthly/yearly × list price / months", "gbp");
  const estimatedArr = planMetric(mix.arr, "estimated MRR × 12", "gbp");

  const retention = warehouse.retention;
  const retain = (days: 1 | 7 | 30): Metric => {
    const rows = retention.filter((r) => r[`matured_d${days}`]);
    const size = rows.reduce((a, r) => a + Number(r.cohort_size ?? 0), 0);
    const returned = rows.reduce((a, r) => a + Number(r[`returned_d${days}`] ?? 0), 0);
    if (!rows.length) {
      return metric("no_data", null, {
        source: "analytics.cohort_retention",
        note: "Incomplete cohorts excluded.",
      });
    }
    return metric("ok", size ? returned / size : 0, {
      source: "analytics.cohort_retention",
      denominator: size,
      sample_size: size,
    });
  };

  const attempts = sum("meal_scans_started") || sum("meal_scans_succeeded") + sum("meal_scans_failed");
  const scanFail =
    !eventsReady || !attempts
      ? metric("no_data", null, { source: "analytics.events", formula: "failed / attempts" })
      : metric("ok", sum("meal_scans_failed") / attempts, { source: "analytics.events", denominator: attempts });

  const expenses = warehouse.expenses;
  const aiRows = warehouse.aiRows;
  const aiCost = aiRows.length
    ? metric("ok", aiRows.reduce((a, r) => a + Number(r.estimated_cost_usd ?? 0), 0), {
        source: "analyze-food estimates",
        note: "Estimates until official usage invoice is reconciled.",
      })
    : metric("no_data", null, { source: "analyze-food estimates" });
  const sharedInfra = expenses.length
    ? metric("ok", expenses.reduce((a, r) => a + Number(r.amount ?? 0), 0), { source: "analytics.expenses" })
    : metric("no_data", null, { source: "analytics.expenses", note: "Enter real invoices. Do not assume Apple 99 or Play 25." });

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
    { id: "accounts", label: "Accounts created", metric: eventMetric("accounts_created", "new accounts", "account_created") },
    { id: "first_meal", label: "First meal logged", metric: firstMeal },
    { id: "paywall", label: "Paywall viewed", metric: eventMetric("paywall_views", "paywall", "paywall_viewed") },
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
    const av = Number(evidenced[i].metric.value);
    const bv = Number(evidenced[i + 1].metric.value);
    if (av <= 0) continue;
    const drop = (av - bv) / av;
    if (largestLoss.drop == null || drop > largestLoss.drop) {
      largestLoss = {
        from: evidenced[i].label,
        to: evidenced[i + 1].label,
        drop,
        note: `${av} people to ${bv}.`,
      };
    }
  }

  return {
    meta: {
      timezone: "Europe/London",
      from,
      to,
      platform,
      channel,
      activation_window_days: activationWindow,
      paid_window_days: paidWindow,
      analytics_start_date: ANALYTICS_START_DATE,
      generated_at: generated,
    },
    connections: connections.map((c) => ({ ...c })),
    overview: {
      first_opens: firstOpens,
      first_meal_activation: firstMeal,
      new_paid_subscribers: newPaid,
      estimated_mrr: estimatedMrr,
      net_proceeds: netProceeds,
      largest_loss: largestLoss,
      growth_action:
        largestLoss.drop == null
          ? {
              action: "Connect store reports and wait for live events. Advice needs an evidenced drop.",
              sample_size: 0,
              window: `${from} → ${to}`,
              step: null,
            }
          : {
              action: `Focus ${largestLoss.from} → ${largestLoss.to}.`,
              sample_size: Number(evidenced[0]?.metric.value ?? 0),
              window: `${from} → ${to}`,
              step: largestLoss.to,
            },
    },
    funnel,
    acquisition: {
      website_visitors: websiteVisitors,
      store_clicks: storeClicks,
      apple_downloads: appleDownloads,
      google_downloads: googleDownloads,
      unknown_channel: metric("ok", sum("first_opens"), {
        source: "empty channel → Unknown",
        note: "No fabricated click-to-install.",
      }),
      attribution_coverage: metric("unavailable", null, { source: "No MMP configured" }),
      cac: metric("unavailable", null, { source: "No confirmed paid ads" }),
    },
    retention: {
      d1: retain(1),
      d7: retain(7),
      d30: retain(30),
      definition: "Returning to scan or log a meal. Immature cohorts excluded.",
    },
    revenue: {
      apple: appleMoney,
      google: googleMoney,
      shared: { ai: aiCost, infrastructure: sharedInfra },
      plans: {
        weekly_active: planMetric(mix.weekly, "active pro_weekly"),
        monthly_active: planMetric(mix.monthly, "active pro_monthly"),
        yearly_active: planMetric(mix.yearly, "active pro_yearly"),
        weekly_added: planMetric(mix.addedWeekly, "INITIAL_PURCHASE pro_weekly in range"),
        monthly_added: planMetric(mix.addedMonthly, "INITIAL_PURCHASE pro_monthly in range"),
        yearly_added: planMetric(mix.addedYearly, "INITIAL_PURCHASE pro_yearly in range"),
        estimated_mrr: estimatedMrr,
        estimated_arr: estimatedArr,
      },
    },
    quality: { scan_failure_rate: scanFail },
    definitions: funnel.map((s) => ({ id: s.id, ...s.metric })),
  };
}

function emptySnapshot(
  meta: {
    from: string;
    to: string;
    platform: string;
    channel: string;
    activationWindow: number;
    paidWindow: number;
    generated: string;
  },
  connections: Connection[],
  missing: Metric,
): Snapshot {
  return {
    meta: {
      timezone: "Europe/London",
      from: meta.from,
      to: meta.to,
      platform: meta.platform,
      channel: meta.channel,
      activation_window_days: meta.activationWindow,
      paid_window_days: meta.paidWindow,
      analytics_start_date: ANALYTICS_START_DATE,
      generated_at: meta.generated,
    },
    connections,
    overview: {
      first_opens: missing,
      first_meal_activation: missing,
      new_paid_subscribers: missing,
      estimated_mrr: missing,
      net_proceeds: missing,
      largest_loss: {
        from: "Unavailable",
        to: "Unavailable",
        drop: null,
        note: "Warehouse not readable from this deployment.",
      },
      growth_action: {
        action: "Set SUPABASE_SERVICE_ROLE_KEY on the dashboard deployment.",
        sample_size: 0,
        window: `${meta.from} → ${meta.to}`,
        step: null,
      },
    },
    funnel: [],
    acquisition: {},
    retention: {
      d1: missing,
      d7: missing,
      d30: missing,
      definition: "Returning to scan or log a meal. Immature cohorts excluded.",
    },
    revenue: { apple: {}, google: {}, shared: {}, plans: {} },
    quality: { scan_failure_rate: missing },
    definitions: [],
  };
}

export function snapshotToCsv(snapshot: Snapshot): string {
  const { from, to, platform, channel, generated_at } = snapshot.meta;
  const lines = [
    "metric,display,status,value,source,from,to,platform,channel,timezone,generated_at",
    ...snapshot.funnel.map((step) =>
      [
        step.id,
        JSON.stringify(displayMetric(step.metric)),
        step.metric.status,
        step.metric.value ?? "",
        JSON.stringify(String(step.metric.source ?? "")),
        from,
        to,
        platform,
        channel,
        "Europe/London",
        generated_at,
      ].join(","),
    ),
  ];
  return lines.join("\n");
}
