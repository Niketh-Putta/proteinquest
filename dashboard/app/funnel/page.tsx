import { Filters, Shell } from "@/components/shell";
import { FunnelList } from "@/components/metrics";
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
      pathname="/funnel"
      title="Funnel"
      subtitle="Website to paid, with Apple and Google kept separate."
      filters={
        <Filters
          action="/funnel"
          from={snapshot.meta.from}
          to={snapshot.meta.to}
          platform={snapshot.meta.platform}
          channel={snapshot.meta.channel}
        />
      }
    >
      <section className="panel">
        <FunnelList snapshot={snapshot} />
      </section>
    </Shell>
  );
}
