import { displayMetric, type Metric, type Snapshot } from "@/lib/data";

export function MetricCard({ label, metric }: { label: string; metric?: Metric }) {
  const m = metric ?? { status: "unavailable" as const, value: null };
  const tone = m.status === "ok" ? "good" : "warn";
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
        <em className={tone}>{m.status.replaceAll("_", " ")}</em>
      </div>
      <strong>{displayMetric(m)}</strong>
      <small>
        {m.source ?? "No source"} · {m.window ?? "window n/a"}
        {m.note ? ` · ${m.note}` : ""}
      </small>
    </article>
  );
}

export function FunnelList({ snapshot }: { snapshot: Snapshot }) {
  const values = snapshot.funnel
    .map((s) => (s.metric.status === "ok" ? Number(s.metric.value ?? 0) : 0))
    .filter((n) => n > 0);
  const max = Math.max(1, ...values);
  return (
    <div className="funnel">
      {snapshot.funnel.map((step) => (
        <div className="funnel-row" key={step.id}>
          <div>
            <b>{step.label}</b>
            <small>{step.metric.source ?? "unwired"}</small>
          </div>
          <i>
            <span
              style={{
                width: `${step.metric.status === "ok" ? Math.max(4, (Number(step.metric.value ?? 0) / max) * 100) : 0}%`,
              }}
            />
          </i>
          <small>{displayMetric(step.metric)}</small>
        </div>
      ))}
    </div>
  );
}
