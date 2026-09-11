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
      pathname="/acquisition"
      title="Acquisition"
      subtitle="Site, Apple and Google. Separate numbers."
      filters={
        <Filters
          action="/acquisition"
          from={snapshot.meta.from}
          to={snapshot.meta.to}
          platform={snapshot.meta.platform}
          channel={snapshot.meta.channel}
        />
      }
    >
      <div className="metric-grid">
        <MetricCard label="Website visitors" metric={snapshot.acquisition.website_visitors} />
        <MetricCard label="Store clickers" metric={snapshot.acquisition.store_clicks} />
        <MetricCard label="Apple downloads" metric={snapshot.acquisition.apple_downloads} />
        <MetricCard label="Google downloads" metric={snapshot.acquisition.google_downloads} />
      </div>
    </Shell>
  );
}
