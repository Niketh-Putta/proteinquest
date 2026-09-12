import { FunnelList } from "@/components/metrics";
import { loadSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const snapshot = await loadSnapshot({ ...params, defaultRange: "all" });
  return (
    <main className="page">
      <section className="panel">
        <FunnelList snapshot={snapshot} />
      </section>
    </main>
  );
}
