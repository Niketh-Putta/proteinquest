// RevenueCat webhook: sync profiles.is_premium from subscription events.
// Secrets: REVENUECAT_WEBHOOK_AUTH (optional bearer token), SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Configure in RevenueCat → Integrations → Webhooks:
//   URL: https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/revenuecat-webhook
//   Authorization header matching REVENUECAT_WEBHOOK_AUTH (recommended)
// App user IDs are Supabase UUIDs. Do not merge by email.
// Sandbox and TEST must not enter production totals. Restore is not a new paid subscriber.

import { resolveEntitlementState } from "../_shared/entitlement-state.ts";
import {
  rcEnvironment,
  shouldUpdatePremium,
  shouldWriteSubscriptionEvent,
} from "../_shared/revenuecat-events.ts";

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
  const rawEvent = (event.event ?? event) as Record<string, unknown>;
  const providerEventId = String(
    rawEvent.id ?? rawEvent.event_id ?? `${eventType}:${userId ?? "unknown"}:${rawEvent.event_timestamp_ms ?? Date.now()}`,
  );
  const environment = rcEnvironment(rawEvent.environment);
  const store = String(rawEvent.store ?? rawEvent.storefront ?? "").toLowerCase();
  const platform = store.includes("play") ? "android" : store.includes("stripe") ? "web" : "ios";

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  await fetch(`${SUPABASE_URL}/rest/v1/webhook_replays?on_conflict=provider,notification_id`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Profile": "analytics",
      Prefer: "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      provider: "revenuecat",
      notification_id: providerEventId,
    }),
  });

  if (shouldWriteSubscriptionEvent(eventType, environment)) {
    await fetch(`${SUPABASE_URL}/rest/v1/subscription_events`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Profile": "analytics",
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        provider: "revenuecat",
        provider_event_id: providerEventId,
        event_type: eventType,
        event_time: new Date(Number(rawEvent.event_timestamp_ms) || Date.now()).toISOString(),
        environment,
        platform,
        user_id: userId,
        product_id: rawEvent.product_id ?? rawEvent.product_identifier ?? null,
        original_transaction_id: rawEvent.original_transaction_id ?? null,
        transaction_id: rawEvent.transaction_id ?? rawEvent.id ?? null,
        purchase_at: rawEvent.purchased_at_ms
          ? new Date(Number(rawEvent.purchased_at_ms)).toISOString()
          : null,
        expires_at: rawEvent.expiration_at_ms
          ? new Date(Number(rawEvent.expiration_at_ms)).toISOString()
          : null,
        entitlement_state: entitlements.includes("pro") ? "entitled" : "none",
        is_trial: Boolean(rawEvent.is_trial_period ?? rawEvent.period_type === "TRIAL"),
      }),
    });

    const entitled = resolveEntitlementState(eventType, entitlements, ENTITLEMENT_ID);
    if (userId) {
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions_current?on_conflict=user_id`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Profile": "analytics",
          Prefer: "return=minimal,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: userId,
          provider: "revenuecat",
          product_id: rawEvent.product_id ?? rawEvent.product_identifier ?? null,
          platform,
          environment,
          entitlement_state: entitled === false ? "none" : entitled === true ? "entitled" : "unknown",
          is_trial: Boolean(rawEvent.is_trial_period ?? rawEvent.period_type === "TRIAL"),
          original_transaction_id: rawEvent.original_transaction_id ?? null,
          expires_at: rawEvent.expiration_at_ms
            ? new Date(Number(rawEvent.expiration_at_ms)).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    await fetch(`${SUPABASE_URL}/rest/v1/rpc/growth_mark_connection`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_provider: "revenuecat",
        p_status: "connected",
        p_error: null,
        p_notes:
          "Production RevenueCat event stored in analytics.subscription_events. Restore/trial/TEST are not new paid. Not statement-verified.",
      }),
    });
  }

  if (!userId) {
    return json({ received: true, skipped: "no app_user_id" });
  }

  if (!shouldUpdatePremium(eventType, environment)) {
    return json({ received: true, event: eventType, environment, is_premium: null });
  }

  const isPremium = resolveEntitlementState(eventType, entitlements, ENTITLEMENT_ID);

  if (isPremium !== null) {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        // Grant → dismiss the paywall. Revoke (expire/billing issue) →
        // clear the dismissal so former subscribers get paywalls like everyone else.
        is_premium: isPremium,
        paywall_dismissed: isPremium,
      }),
    });
  }

  return json({ received: true, event: eventType, environment, is_premium: isPremium });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
