import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/session";

const COOKIE_NAME = "pq_growth_session";

const PUBLIC = new Set([
  "/login",
  "/api/auth/login",
  "/favicon.svg",
  "/robots.txt",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  if (PUBLIC.has(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.DASHBOARD_SESSION_SECRET ?? "";
  if (token && secret && (await verifySession(token, secret))) {
    return NextResponse.next();
  }

  const syncToken = process.env.GROWTH_SYNC_TOKEN?.trim();
  const provided = req.headers.get("x-growth-sync") ?? "";
  if (
    pathname === "/api/sync" &&
    req.method === "POST" &&
    syncToken &&
    provided.length === syncToken.length &&
    provided === syncToken
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
