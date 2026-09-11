export type PlanKind = "weekly" | "monthly" | "yearly" | "unknown";

/** List prices from the live paywall. Estimates only. Not store proceeds. */
export const PLAN_GBP = {
  weekly: { id: "pro_weekly", price: 6.99, months: 12 / (365.25 / 7) },
  monthly: { id: "pro_monthly", price: 9.99, months: 1 },
  yearly: { id: "pro_yearly", price: 29.99, months: 12 },
} as const;

const ENDED = new Set(["EXPIRATION", "REFUND"]);
const ACTIVE = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
  "CANCELLATION",
]);

export function classifyPlan(productId: string | null | undefined): PlanKind {
  const id = String(productId ?? "").toLowerCase();
  if (id.includes("week")) return "weekly";
  if (id.includes("year") || id.includes("annual")) return "yearly";
  if (id.includes("month")) return "monthly";
  return "unknown";
}

export function mrrForPlan(kind: PlanKind): number {
  if (kind === "unknown") return 0;
  const plan = PLAN_GBP[kind];
  return plan.price / plan.months;
}

export function isActivePaidSubscriber(input: {
  eventType: string;
  environment?: string | null;
  isTrial?: boolean | null;
  expiresAt?: string | null;
  now?: Date;
}): boolean {
  if (input.environment !== "production") return false;
  if (input.isTrial) return false;
  const type = input.eventType.trim().toUpperCase();
  if (type === "TEST" || type === "RESTORE" || type === "TRANSFER") return false;
  if (ENDED.has(type)) return false;
  const now = input.now ?? new Date();
  if (input.expiresAt) {
    const expires = new Date(input.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) return false;
  }
  return ACTIVE.has(type);
}

export type PlanMix = {
  weekly: number;
  monthly: number;
  yearly: number;
  unknown: number;
  addedWeekly: number;
  addedMonthly: number;
  addedYearly: number;
  mrr: number;
  arr: number;
};

export function planMixFromEvents(
  events: Record<string, unknown>[],
  options?: { from?: string; to?: string; now?: Date },
): PlanMix {
  const now = options?.now ?? new Date();
  const latest = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    if (String(event.environment ?? "") !== "production") continue;
    const user = String(event.user_id ?? "");
    if (!user) continue;
    const prev = latest.get(user);
    const time = String(event.event_time ?? event.purchase_at ?? "");
    if (!prev || time >= String(prev.event_time ?? prev.purchase_at ?? "")) latest.set(user, event);
  }

  const mix: PlanMix = {
    weekly: 0,
    monthly: 0,
    yearly: 0,
    unknown: 0,
    addedWeekly: 0,
    addedMonthly: 0,
    addedYearly: 0,
    mrr: 0,
    arr: 0,
  };

  for (const event of latest.values()) {
    if (
      !isActivePaidSubscriber({
        eventType: String(event.event_type ?? ""),
        environment: String(event.environment ?? ""),
        isTrial: event.is_trial === true,
        expiresAt: event.expires_at ? String(event.expires_at) : null,
        now,
      })
    ) {
      continue;
    }
    const kind = classifyPlan(event.product_id ? String(event.product_id) : null);
    mix[kind] += 1;
    mix.mrr += mrrForPlan(kind);
  }
  mix.arr = mix.mrr * 12;

  for (const event of events) {
    const time = String(event.event_time ?? "").slice(0, 10);
    if (options.from && time && time < options.from) continue;
    if (options.to && time && time > options.to) continue;
    if (
      String(event.environment ?? "") !== "production" ||
      event.is_trial === true ||
      String(event.event_type ?? "").toUpperCase() !== "INITIAL_PURCHASE"
    ) {
      continue;
    }
    const kind = classifyPlan(event.product_id ? String(event.product_id) : null);
    if (kind === "weekly") mix.addedWeekly += 1;
    if (kind === "monthly") mix.addedMonthly += 1;
    if (kind === "yearly") mix.addedYearly += 1;
  }

  return mix;
}
