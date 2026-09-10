import { Filters, Shell } from "@/components/shell";
import { MetricCard } from "@/components/metrics";
import { displayMetric, loadSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const snapshot = await loadSnapshot(await searchParams);
  return (
    <Shell
      pathname="/revenue"
      title="Revenue and costs"
      subtitle="GBP presentation. Official store statements are the accounting truth. Do not double-count fees."
      filters={
        <Filters
          action="/revenue"
          from={snapshot.meta.from}
          to={snapshot.meta.to}
          platform={snapshot.meta.platform}
          channel={snapshot.meta.channel}
        />
      }
    >
      <div className="platforms">
        <article>
          <span>Apple proceeds</span>
          <strong>{displayMetric(snapshot.revenue.apple.proceeds ?? { status: "not_connected", value: null })}</strong>
          <small>Gross {displayMetric(snapshot.revenue.apple.billings ?? { status: "not_connected", value: null })}</small>
        </article>
        <article>
          <span>Google proceeds</span>
          <strong>{displayMetric(snapshot.revenue.google.proceeds ?? { status: "not_connected", value: null })}</strong>
          <small>Gross {displayMetric(snapshot.revenue.google.billings ?? { status: "not_connected", value: null })}</small>
        </article>
        <article className="coverage">
          <span>Shared costs</span>
          <strong>{displayMetric(snapshot.revenue.shared.infrastructure ?? { status: "no_data", value: null })}</strong>
          <p>Not allocated across both stores unless a rule is selected.</p>
        </article>
      </div>
      <div className="metric-grid">
        <MetricCard label="Apple refunds" metric={snapshot.revenue.apple.refunds} />
        <MetricCard label="Apple tax" metric={snapshot.revenue.apple.taxes} />
        <MetricCard label="Apple fees" metric={snapshot.revenue.apple.fees} />
        <MetricCard label="Google refunds" metric={snapshot.revenue.google.refunds} />
        <MetricCard label="Google tax" metric={snapshot.revenue.google.taxes} />
        <MetricCard label="Google fees" metric={snapshot.revenue.google.fees} />
        <MetricCard label="AI cost" metric={snapshot.revenue.shared.ai} />
      </div>
    </Shell>
  );
}
