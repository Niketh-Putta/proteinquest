"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseRangePreset, type DateRangePreset } from "@/lib/range";

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

const RANGE_BUTTONS: { id: DateRangePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "month", label: "Last month" },
  { id: "week", label: "Last week" },
];

function Filters({ action }: { action: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const fallback: DateRangePreset = action === "/funnel" ? "all" : "month";
  const range = parseRangePreset(params.get("range")) ?? fallback;
  const platform = params.get("platform") || "all";

  const hrefFor = (nextRange: DateRangePreset, nextPlatform = platform) => {
    const q = new URLSearchParams();
    q.set("range", nextRange);
    if (nextPlatform !== "all") q.set("platform", nextPlatform);
    const text = q.toString();
    return text ? `${action}?${text}` : action;
  };

  return (
    <div className="controls">
      <nav className="range-toggle" aria-label="Date range">
        {RANGE_BUTTONS.map((btn) => (
          <Link key={btn.id} href={hrefFor(btn.id)} className={range === btn.id ? "active" : undefined} prefetch>
            {btn.label}
          </Link>
        ))}
      </nav>
      <select
        aria-label="Platform"
        value={platform}
        onChange={(e) => router.push(hrefFor(range, e.target.value))}
      >
        <option value="all">All platforms</option>
        <option value="ios">Apple</option>
        <option value="android">Google</option>
      </select>
    </div>
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
