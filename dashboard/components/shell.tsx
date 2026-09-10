import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  ["/", "Overview"],
  ["/funnel", "Funnel"],
  ["/acquisition", "Acquisition"],
  ["/retention", "Retention"],
  ["/revenue", "Revenue"],
  ["/quality", "Quality"],
  ["/connections", "Connections"],
  ["/metrics", "Definitions"],
] as const;

export function Shell({
  title,
  subtitle,
  pathname,
  children,
  filters,
}: {
  title: string;
  subtitle: string;
  pathname: string;
  children: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>PQ</span>
          <strong>
            Protein<b>Quest</b>
          </strong>
        </div>
        <nav>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <footer>
          <span />
          Private owner workspace
          <small>Noindex · 8 hour session · no sample numbers</small>
        </footer>
      </aside>
      <div>
        <header className="topbar">
          <div>
            <span className="kicker">Growth OS</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="controls">
            {filters}
            <form className="logout-form" action="/api/auth/logout" method="post">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

export function Filters({
  from,
  to,
  platform,
  channel,
  action,
}: {
  from: string;
  to: string;
  platform: string;
  channel: string;
  action: string;
}) {
  return (
    <form action={action} method="get" className="controls">
      <em>Europe/London</em>
      <input type="date" name="from" defaultValue={from} />
      <input type="date" name="to" defaultValue={to} />
      <select name="platform" defaultValue={platform}>
        <option value="all">All platforms</option>
        <option value="ios">Apple</option>
        <option value="android">Google</option>
        <option value="web">Web</option>
      </select>
      <select name="channel" defaultValue={channel}>
        <option value="all">All channels</option>
        <option value="unknown">Unknown</option>
      </select>
      <button type="submit">Apply</button>
      <a className="quiet" href={`/api/export?from=${from}&to=${to}&platform=${platform}&channel=${channel}`}>
        Export CSV
      </a>
    </form>
  );
}
