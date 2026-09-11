"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const NAV = [
  ["/", "Overview"],
  ["/funnel", "Funnel"],
  ["/acquisition", "Acquisition"],
  ["/retention", "Retention"],
  ["/revenue", "Revenue"],
  ["/quality", "Quality"],
  ["/connections", "Connections"],
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    for (const [href] of NAV) router.prefetch(href);
  }, [router]);
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/proteinquest-logo.png" width="40" height="40" alt="ProteinQuest logo" />
        <strong>
          Protein<b>Quest</b>
        </strong>
      </div>
      <nav>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} prefetch className={pathname === href ? "active" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <footer>
        <span />
        Private owner workspace
        <small>ProteinQuest admin dashboard</small>
      </footer>
    </aside>
  );
}
