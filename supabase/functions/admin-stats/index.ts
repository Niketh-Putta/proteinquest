import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsResponse, json, verifyAdminToken } from "../_shared/admin.ts";

const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!ADMIN_PASSWORD || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Admin stats are not configured." }, 503);
  }

  const token = req.headers.get("x-admin-token");
  if (!token || !(await verifyAdminToken(token, ADMIN_PASSWORD))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("get_admin_stats");

  if (error) {
    console.error("admin-stats error:", error);
    return json({ error: "Could not load stats." }, 500);
  }

  return json(data);
});
