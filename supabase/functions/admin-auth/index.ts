import {
  clientIp,
  corsResponse,
  createAdminToken,
  json,
  rateLimit,
} from "../_shared/admin.ts";

const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!ADMIN_PASSWORD) {
    return json({ error: "Admin access is not configured." }, 503);
  }

  const ip = clientIp(req);
  if (rateLimit(ip)) {
    return json({ error: "Too many attempts. Try again later." }, 429);
  }

  try {
    const { password } = await req.json();
    if (typeof password !== "string" || !password) {
      return json({ error: "Invalid request" }, 400);
    }

    if (password !== ADMIN_PASSWORD) {
      return json({ error: "Invalid password" }, 401);
    }

    const token = await createAdminToken(ADMIN_PASSWORD);
    return json({ token, expires_in_hours: 2 });
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
});
