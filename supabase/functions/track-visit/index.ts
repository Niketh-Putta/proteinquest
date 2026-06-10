import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { clientIp, corsResponse, json, sha256Hex } from "../_shared/admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VISIT_HASH_SALT = Deno.env.get("VISIT_HASH_SALT") ??
  Deno.env.get("ADMIN_PASSWORD") ?? "proteinquest-visits";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false }, 503);
  }

  try {
    const ip = clientIp(req);
    const ua = req.headers.get("user-agent") ?? "";
    const ipHash = await sha256Hex(`${VISIT_HASH_SALT}:ip:${ip}`);
    const uaHash = ua ? await sha256Hex(`${VISIT_HASH_SALT}:ua:${ua}`) : null;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from("page_visits").upsert(
      {
        ip_hash: ipHash,
        user_agent_hash: uaHash,
        visit_date: new Date().toISOString().slice(0, 10),
      },
      { onConflict: "ip_hash,visit_date", ignoreDuplicates: true },
    );

    if (error) {
      console.error("track-visit error:", error);
      return json({ ok: false }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("track-visit error:", err);
    return json({ ok: false }, 500);
  }
});
