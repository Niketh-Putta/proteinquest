"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;
  return (
    <div className="shell">
      <Sidebar />
      <div>
        <Suspense fallback={<header className="topbar" />}>
          <Topbar />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
