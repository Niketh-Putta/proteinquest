import { NextResponse } from "next/server";
import { runImports } from "@/lib/imports";
import { syncAuthorized } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(req: Request) {
  if (!syncAuthorized(req)) {
    const cookie = req.headers.get("cookie") ?? "";
    if (!cookie.includes("pq_growth_session=")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const results = await runImports();
    if (req.headers.get("accept")?.includes("application/json") || req.method === "GET") {
      return NextResponse.json(results);
    }
    return NextResponse.redirect(new URL("/connections", req.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
