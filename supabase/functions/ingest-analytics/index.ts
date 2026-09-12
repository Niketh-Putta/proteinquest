import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsResponse, json, rateLimit, clientIp } from "../_shared/admin.ts";
import {
  ANALYTICS_SCHEMA_VERSION,
  isAllowedEventName,
  stripForbiddenProps,
} from "../_shared/growth-events.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Ingest is not configured." }, 503);
  }

  if (rateLimit(clientIp(req), 120, 60_000)) {
    return json({ error: "Too many events." }, 429);
  }

  let payload: { events?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const raw = Array.isArray(payload.events) ? payload.events : [];
  if (!raw.length || raw.length > 50) {
    return json({ error: "Send 1-50 events." }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let accepted = 0;
  let duplicates = 0;
  const rejected: string[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      rejected.push("invalid_row");
      continue;
    }
    const row = item as Record<string, unknown>;
    const eventId = String(row.event_id ?? "");
    const eventName = String(row.event_name ?? "");
    const installId = String(row.install_id ?? "");
    const environment = String(row.environment ?? "production");
    const platform = String(row.platform ?? "");
    if (!UUID_RE.test(eventId) || !UUID_RE.test(installId)) {
      rejected.push("bad_id");
      continue;
    }
    if (!isAllowedEventName(eventName)) {
      rejected.push(eventName);
      continue;
    }
    if (environment !== "production" && environment !== "sandbox") {
      rejected.push("bad_env");
      continue;
    }
    if (!["ios", "android", "web"].includes(platform)) {
      rejected.push("bad_platform");
      continue;
    }

    const eventTime = Date.parse(String(row.event_time ?? ""));
    if (!Number.isFinite(eventTime)) {
      rejected.push("bad_time");
      continue;
    }

    const userId = row.user_id ? String(row.user_id) : null;
    if (userId && !UUID_RE.test(userId)) {
      rejected.push("bad_user");
      continue;
    }

    const { data, error } = await supabase.rpc("ingest_event", {
      p_event_id: eventId,
      p_event_name: eventName,
      p_event_time: new Date(eventTime).toISOString(),
      p_schema_version: Number(row.schema_version ?? ANALYTICS_SCHEMA_VERSION),
      p_environment: environment,
      p_platform: platform,
      p_app_version: row.app_version ? String(row.app_version) : null,
      p_build_number: row.build_number ? String(row.build_number) : null,
      p_install_id: installId,
      p_user_id: userId,
      p_experiment_id: row.experiment_id ? String(row.experiment_id) : null,
      p_variant_id: row.variant_id ? String(row.variant_id) : null,
      p_channel: row.channel ? String(row.channel) : null,
      p_properties: stripForbiddenProps(
        (row.properties as Record<string, unknown>) ?? {},
      ),
    });

    if (error) {
      console.error("ingest-analytics rpc error");
      rejected.push("rpc");
      continue;
    }
    if (data === true) accepted += 1;
    else duplicates += 1;
  }

  return json({ ok: true, accepted, duplicates, rejected: rejected.length });
});
