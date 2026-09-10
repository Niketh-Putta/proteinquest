import { Shell } from "@/components/shell";
import { loadSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await loadSnapshot({});
  return (
    <Shell
      pathname="/connections"
      title="Connections"
      subtitle="implemented, connected, verified and requires owner access are separate. Credentials are never shown."
    >
      <section className="panel">
        <form action="/api/sync" method="post">
          <button className="quiet" type="submit">
            Run store / FX import
          </button>
        </form>
        <div className="api-list">
          {snapshot.connections.map((c) => (
            <div key={c.provider}>
              <span>
                <b>{c.provider}</b>
                <small>{c.notes ?? "No notes"}</small>
              </span>
              <strong>{c.status.replaceAll("_", " ")}</strong>
              <small>Last success {c.last_success_at ?? "—"}</small>
              <small>{c.error_summary ?? "no error"}</small>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
