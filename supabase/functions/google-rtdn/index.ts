import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parsePlayRtdn, rtdnReplayIds } from "../_shared/play-rtdn.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PLAY_RTDN_AUDIENCE =
  Deno.env.get("GOOGLE_RTDN_AUDIENCE") ??
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/google-rtdn` : "");

async function verifyPubSubOidc(req: Request): Promise<boolean> {
  if (!PLAY_RTDN_AUDIENCE) return false;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return false;
  const info = (await res.json()) as { aud?: string; iss?: string; email?: string };
  const iss = String(info.iss ?? "");
  const issOk = iss === "https://accounts.google.com" || iss === "accounts.google.com";
  const audOk = String(info.aud ?? "") === PLAY_RTDN_AUDIENCE;
  return issOk && audOk;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Unavailable" }, 503);
  if (!(await verifyPubSubOidc(req))) {
    return json({ error: "Play RTDN is not verified." }, 401);
  }

  const body = await req.json().catch(() => null) as {
    message?: { messageId?: string; data?: string };
  } | null;
  const parsed = parsePlayRtdn(body);
  const replayIds = rtdnReplayIds(parsed);
  if (!replayIds.length) return json({ error: "Missing message id" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const notificationId of replayIds) {
    const { error } = await supabase.schema("analytics").from("webhook_replays").insert({
      provider: "google_rtdn",
      notification_id: notificationId,
    });
    if (error && !/duplicate|unique/i.test(error.message)) {
      return json({ error: "Replay store failed" }, 500);
    }
  }

  if (!parsed.isTest && parsed.packageName === "com.proteinquest.app") {
    const { error } = await supabase.schema("analytics").from("subscription_events").insert({
      provider: "google_rtdn",
      provider_event_id: parsed.messageId ?? parsed.purchaseToken,
      event_type: parsed.notificationType == null
        ? "play_rtdn"
        : `play_notification_${parsed.notificationType}`,
      event_time: parsed.eventTime ?? new Date().toISOString(),
      environment: "production",
      platform: "android",
      product_id: parsed.subscriptionId,
      purchase_token: parsed.purchaseToken,
    });
    if (error && !/duplicate|unique/i.test(error.message)) {
      return json({ error: "Event store failed" }, 500);
    }
  }

  await supabase.rpc("growth_mark_connection", {
    p_provider: "google_rtdn",
    p_status: "connected",
    p_error: null,
    p_notes: parsed.isTest
      ? "Play testNotification received. Not a paid subscriber. Not statement-verified."
      : "Play RTDN stored. Native Play notification types only. Not statement-verified.",
  });

  return json({ received: true, test: parsed.isTest });
});
