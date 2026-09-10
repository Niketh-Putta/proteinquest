import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { json } from "../_shared/admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PLAY_RTDN_AUDIENCE = Deno.env.get("GOOGLE_RTDN_AUDIENCE");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!PLAY_RTDN_AUDIENCE) {
    return json({ error: "Play RTDN is not connected." }, 503);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Unavailable" }, 503);

  const body = await req.json().catch(() => null) as { message?: { messageId?: string; data?: string } } | null;
  const messageId = body?.message?.messageId;
  if (!messageId) return json({ error: "Missing message id" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.schema("analytics").from("webhook_replays").insert({
    provider: "google_rtdn",
    notification_id: messageId,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    return json({ error: "Replay store failed" }, 500);
  }
  return json({ received: true });
});
