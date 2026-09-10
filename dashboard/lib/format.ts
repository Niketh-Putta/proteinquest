import type { Metric } from "./types";

export function displayMetric(m: Metric): string {
  if (m.status === "not_connected") return "Not connected";
  if (m.status === "unavailable") return "Unavailable";
  if (m.status === "no_data" || m.value == null) return "No data";
  if (Math.abs(m.value) > 0 && Math.abs(m.value) < 1) return `${(m.value * 100).toFixed(1)}%`;
  return Number.isInteger(m.value)
    ? m.value.toLocaleString()
    : m.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
