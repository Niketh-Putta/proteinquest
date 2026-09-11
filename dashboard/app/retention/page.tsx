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
        <MetricCard label="D1 meal return" metric={snapshot.retention.d1} />
        <MetricCard label="D7 meal return" metric={snapshot.retention.d7} />
        <MetricCard label="D30 meal return" metric={snapshot.retention.d30} />
      </div>
    </main>
  );
}
