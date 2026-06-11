// RevenueCat webhook: sync profiles.is_premium from subscription events.
// Secrets: REVENUECAT_WEBHOOK_AUTH (optional bearer token), SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Configure in RevenueCat → Integrations → Webhooks:
//   URL: https://<project>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization header matching REVENUECAT_WEBHOOK_AUTH (recommended)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");

const ENTITLEMENT_ID = "pro";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (WEBHOOK_AUTH) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${WEBHOOK_AUTH}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Webhook not configured", { status: 503 });
  }

  let event: {
    type?: string;
    app_user_id?: string;
    event?: {
      type?: string;
      app_user_id?: string;
      entitlement_ids?: string[];
    };
  };

  try {
    event = await req.json();
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const eventType = event.type ?? event.event?.type ?? "";
  const userId = event.app_user_id ?? event.event?.app_user_id;
  const entitlements = event.event?.entitlement_ids ?? [];

  if (!userId) {
    return json({ received: true, skipped: "no app_user_id" });
  }

  const grantEvents = new Set([
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "PRODUCT_CHANGE",
    "SUBSCRIPTION_EXTENDED",
  ]);
  const revokeEvents = new Set([
    "EXPIRATION",
    "CANCELLATION",
    "BILLING_ISSUE",
  ]);

  let isPremium: boolean | null = null;

  if (grantEvents.has(eventType)) {
    isPremium = entitlements.length === 0 || entitlements.includes(ENTITLEMENT_ID);
  } else if (revokeEvents.has(eventType)) {
    isPremium = false;
  }

  if (isPremium !== null) {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        is_premium: isPremium,
        ...(isPremium ? { paywall_dismissed: true } : {}),
      }),
    });
  }

  return json({ received: true, event: eventType, is_premium: isPremium });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
