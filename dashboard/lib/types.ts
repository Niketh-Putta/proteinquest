export type Status = "ok" | "no_data" | "not_connected" | "unavailable";

export type Metric = {
  status: Status;
  value: number | null;
  source?: string;
  formula?: string;
  denominator?: unknown;
  window?: string;
  last_refresh?: string | null;
  note?: string;
  sample_size?: number;
};
