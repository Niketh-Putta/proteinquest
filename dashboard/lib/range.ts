export const ALL_TIME_START = "2026-06-01";

export type DateRangePreset = "all" | "month" | "week";

export function londonToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseRangePreset(value: string | null | undefined): DateRangePreset | null {
  return value === "all" || value === "month" || value === "week" ? value : null;
}

export function resolveRange(
  range: string | null | undefined,
  fallback: DateRangePreset = "month",
): { range: DateRangePreset; from: string; to: string } {
  const to = londonToday();
  const key = parseRangePreset(range) ?? fallback;
  if (key === "all") return { range: key, from: ALL_TIME_START, to };
  if (key === "week") return { range: key, from: shiftDate(to, -6), to };
  return { range: key, from: shiftDate(to, -29), to };
}
