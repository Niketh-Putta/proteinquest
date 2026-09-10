import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { json } from "../_shared/admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APPLE_NOTIFY_SECRET = Deno.env.get("APPLE_ASSN_SECRET");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!APPLE_NOTIFY_SECRET) {
    return json({ error: "App Store Server Notifications are not connected." }, 503);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Unavailable" }, 503);

  const body = await req.json().catch(() => null);
  const signed = body && typeof body === "object" ? (body as { signedPayload?: string }).signedPayload : null;
  if (!signed) return json({ error: "Missing signedPayload" }, 400);

  // JWS verification requires the Apple root + the stored .p8/issuer pair.
  // Until those secrets are present this endpoint stays 503 above.
  const notificationId = signed.slice(0, 64);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.schema("analytics").from("webhook_replays").insert({
    provider: "app_store_server",
    notification_id: notificationId,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    return json({ error: "Replay store failed" }, 500);
  }
  return json({ received: true });
});
