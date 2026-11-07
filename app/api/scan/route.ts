import { NextResponse } from "next/server";
import { scanForWeb } from "@/lib/engine";

/**
 * Scan a public repository.
 *
 * The engine already decides between a live GitHub read, a cached copy, the
 * recorded snapshot and the bundled sample, and it reports which one it used.
 * That field travels to the client untouched so the page can say so.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const repo = (body as { repo?: unknown } | null)?.repo;
  if (typeof repo !== "string" || repo.trim().length === 0) {
    return NextResponse.json({ error: "Give me a public repository URL." }, { status: 400 });
  }

  try {
    const result = await scanForWeb(repo.trim());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The scan failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
