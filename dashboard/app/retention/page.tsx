import { Filters, Shell } from "@/components/shell";
import { MetricCard } from "@/components/metrics";
import { loadSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const snapshot = await loadSnapshot(await searchParams);
  return (
    <Shell
      pathname="/retention"
      title="Retention"
      subtitle={snapshot.retention.definition}
      filters={
        <Filters
          action="/retention"
          from={snapshot.meta.from}
          to={snapshot.meta.to}
          platform={snapshot.meta.platform}
          channel={snapshot.meta.channel}
        />
      }
    >
      <div className="metric-grid">
        <MetricCard label="D1 meal return" metric={snapshot.retention.d1} />
        <MetricCard label="D7 meal return" metric={snapshot.retention.d7} />
        <MetricCard label="D30 meal return" metric={snapshot.retention.d30} />
      </div>
    </Shell>
  );
}
