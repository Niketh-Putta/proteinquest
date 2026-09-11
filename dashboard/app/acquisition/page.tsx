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
        <MetricCard label="Website visitors" metric={snapshot.acquisition.website_visitors} />
        <MetricCard label="Store clickers" metric={snapshot.acquisition.store_clicks} />
        <MetricCard label="Apple downloads" metric={snapshot.acquisition.apple_downloads} />
        <MetricCard label="Google downloads" metric={snapshot.acquisition.google_downloads} />
      </div>
    </main>
  );
}
