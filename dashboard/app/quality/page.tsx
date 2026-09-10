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
      pathname="/quality"
      title="Quality"
      subtitle="Scan failure uses attempts, not users."
      filters={
        <Filters
          action="/quality"
          from={snapshot.meta.from}
          to={snapshot.meta.to}
          platform={snapshot.meta.platform}
          channel={snapshot.meta.channel}
        />
      }
    >
      <div className="metric-grid">
        <MetricCard label="Scan failure rate" metric={snapshot.quality.scan_failure_rate} />
      </div>
    </Shell>
  );
}
