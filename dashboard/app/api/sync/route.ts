import { NextResponse } from "next/server";
import { runImports } from "@/lib/imports";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const results = await runImports();
    if (req.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json(results);
    }
    return NextResponse.redirect(new URL("/connections", req.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
