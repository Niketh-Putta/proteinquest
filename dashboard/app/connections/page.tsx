import { loadConnections } from "@/lib/data";
import { providerLabel, statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function Page() {
  const connections = await loadConnections();
  return (
    <main className="page">
      <section className="panel">
        <div className="api-list">
          {connections.map((c) => (
            <div key={c.provider}>
              <span>
                <b>{providerLabel(c.provider)}</b>
              </span>
              <strong>{statusLabel(c.status)}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
