export function eventDay(value: unknown) {
  const d = new Date(String(value ?? ""));
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function filterWebEvents(
  events: Record<string, unknown>[],
  eventName: string,
  from: string,
  to: string,
  platform: string,
  channel: string,
) {
  return events.filter((event) => {
    if (String(event.environment ?? "production") !== "production") return false;
    if (String(event.event_name ?? "") !== eventName) return false;
    const day = eventDay(event.event_time);
    if (!day || day < from || day > to) return false;
    if (platform !== "all" && String(event.platform ?? "") !== platform) return false;
    if (channel !== "all" && String(event.channel ?? "unknown") !== channel) return false;
    return true;
  });
}

export function countDistinctIds(events: Record<string, unknown>[], key = "install_id") {
  return new Set(events.map((event) => String(event[key] ?? "")).filter(Boolean)).size;
}
