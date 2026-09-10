import { Shell } from "@/components/shell";
import { displayMetric, loadSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await loadSnapshot({});
  return (
    <Shell pathname="/metrics" title="Definitions" subtitle="Source, formula, denominator, window and last refresh.">
      <section className="panel definitions">
        <div>
          {snapshot.definitions.map((item) => (
            <article key={item.id}>
              <b>{item.id}</b>
              <p className="plain-note">{displayMetric(item)} · {item.status}</p>
              <code>
                source={item.source ?? "n/a"} · formula={item.formula ?? "n/a"} · denom=
                {String(item.denominator ?? "n/a")} · window={item.window ?? "n/a"} · refresh=
                {item.last_refresh ?? "n/a"}
              </code>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
