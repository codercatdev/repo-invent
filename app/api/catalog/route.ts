import { NextResponse } from "next/server";
import { servedCatalog } from "@/lib/engine";

/**
 * The catalog the app browses.
 *
 * `servedCatalog` prefers live data, then a cache under six hours, then a stale
 * cache, then the bundled fixture, and always names which one it served. The
 * browser table can therefore say "live", "cached" or "sample" truthfully.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    const catalog = await servedCatalog();
    return NextResponse.json(
      {
        source: catalog.source,
        fetchedAt: catalog.fetchedAt,
        count: catalog.sessions.length,
        sessions: catalog.sessions,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The catalog could not load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
