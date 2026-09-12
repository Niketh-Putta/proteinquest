import { loadSnapshot, snapshotToCsv } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const snapshot = await loadSnapshot({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    platform: url.searchParams.get("platform"),
    channel: url.searchParams.get("channel"),
  });
  return new Response(snapshotToCsv(snapshot), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proteinquest-growth-${snapshot.meta.from}-${snapshot.meta.to}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
