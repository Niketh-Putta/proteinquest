import { NextResponse } from "next/server";
import { runImports } from "@/lib/imports";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await runImports();
    return NextResponse.redirect(new URL("/connections", req.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
