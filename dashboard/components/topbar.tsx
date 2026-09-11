"use client";

import { usePathname, useSearchParams } from "next/navigation";

const PAGES: Record<string, { title: string; subtitle: string; filters?: boolean }> = {
  "/": { title: "Overview", subtitle: "Opens, first meals, paid users and money.", filters: true },
  "/funnel": { title: "Funnel", subtitle: "Website to paid.", filters: true },
  "/acquisition": { title: "Acquisition", subtitle: "Site, Apple and Google. Separate numbers.", filters: true },
  "/retention": { title: "Retention", subtitle: "Who came back to scan.", filters: true },
  "/revenue": {
    title: "Revenue and costs",
    subtitle: "Estimated MRR from live subscriptions. Store payouts when Apple or Google send a statement.",
    filters: true,
  },
  "/quality": { title: "Quality", subtitle: "Failed scans.", filters: true },
  "/connections": { title: "Connections", subtitle: "What is live." },
  "/metrics": { title: "Definitions", subtitle: "Source, formula, denominator, window and last refresh." },
};

function londonToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function defaultFrom(to: string) {
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 29);
  return d.toISOString().slice(0, 10);
}

function Filters({ action }: { action: string }) {
  const params = useSearchParams();
  const to = params.get("to") || londonToday();
  const from = params.get("from") || defaultFrom(to);
  const platform = params.get("platform") || "all";
  return (
    <form action={action} method="get" className="controls">
      <input aria-label="Start date" type="date" name="from" defaultValue={from} />
      <input aria-label="End date" type="date" name="to" defaultValue={to} />
      <select aria-label="Platform" name="platform" defaultValue={platform}>
        <option value="all">All platforms</option>
        <option value="ios">Apple</option>
        <option value="android">Google</option>
      </select>
      <button type="submit">Apply</button>
    </form>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const page = PAGES[pathname] ?? { title: "Growth OS", subtitle: "" };
  return (
    <header className="topbar">
      <div>
        <span className="kicker">Growth OS</span>
        <h1>{page.title}</h1>
        <p>{page.subtitle}</p>
      </div>
      <div className="controls">
        {page.filters ? <Filters action={pathname} /> : null}
        <form className="logout-form" action="/api/auth/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
