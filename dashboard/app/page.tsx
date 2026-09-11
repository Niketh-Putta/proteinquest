import { Filters, Shell } from "@/components/shell";
import { FunnelList, MetricCard } from "@/components/metrics";
import { loadSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const snapshot = await loadSnapshot(params);
  return (
    <Shell
      pathname="/"
      title="Overview"
      subtitle="Opens, first meals, paid users and money."
      filters={
        <Filters
          action="/"
          from={snapshot.meta.from}
          to={snapshot.meta.to}
          platform={snapshot.meta.platform}
          channel={snapshot.meta.channel}
        />
      }
    >
      <div className="metric-grid">
        <MetricCard label="New first opens" metric={snapshot.overview.first_opens} />
        <MetricCard label="First-meal activation" metric={snapshot.overview.first_meal_activation} />
        <MetricCard label="New paid subscribers" metric={snapshot.overview.new_paid_subscribers} />
        <MetricCard label="Estimated MRR" metric={snapshot.overview.estimated_mrr} />
        <MetricCard label="Net proceeds" metric={snapshot.overview.net_proceeds} />
      </div>
      <section className="priority">
        <span className="kicker">Largest evidenced loss</span>
        <h2>
          {snapshot.overview.largest_loss.from} → {snapshot.overview.largest_loss.to}
        </h2>
        <p>{snapshot.overview.largest_loss.note}</p>
        <p>
          <strong>Next:</strong> {snapshot.overview.growth_action.action}
        </p>
      </section>
      <section className="panel">
        <div className="section-head">
          <div>
            <span>Funnel</span>
            <h2>Cohort milestones</h2>
            <p>People can skip steps. These are milestones, not a forced path.</p>
          </div>
        </div>
        <FunnelList snapshot={snapshot} />
      </section>
    </Shell>
  );
}
