import { displayMetric, type Metric, type Snapshot } from "@/lib/data";
import { metricHint } from "@/lib/labels";

export function MetricCard({ label, metric }: { label: string; metric?: Metric }) {
  const m = metric ?? { status: "unavailable" as const, value: null };
  const hint = metricHint(m.status);
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
      </div>
      <strong>{displayMetric(m)}</strong>
      {hint ? <small>{hint}</small> : null}
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
