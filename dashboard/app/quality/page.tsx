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
    <main className="page">
      <div className="metric-grid">
        <MetricCard label="Scan failure rate" metric={snapshot.quality.scan_failure_rate} />
      </div>
    </main>
  );
}
