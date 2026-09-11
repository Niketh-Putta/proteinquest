function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function syncAuthorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const provided = req.headers.get("x-growth-sync")?.trim() || bearer;
  const allowed = [process.env.GROWTH_SYNC_TOKEN, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return allowed.some((secret) => timingSafeEqual(provided, secret));
}
