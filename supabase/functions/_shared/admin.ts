const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

export function corsResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createAdminToken(secret: string): Promise<string> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const sig = await hmacSign(`admin:${hour}`, secret);
  return `${hour}.${sig}`;
}

export async function verifyAdminToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const [hourStr, sig] = token.split(".");
  if (!hourStr || !sig) return false;

  const hour = Number.parseInt(hourStr, 10);
  if (!Number.isFinite(hour)) return false;

  const nowHour = Math.floor(Date.now() / 3_600_000);
  if (Math.abs(nowHour - hour) > 2) return false;

  const expected = await hmacSign(`admin:${hour}`, secret);
  return sig === expected;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "unknown";
}

const attemptMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string, max = 8, windowMs = 900_000): boolean {
  const now = Date.now();
  const entry = attemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
