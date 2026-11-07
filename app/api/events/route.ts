import { NextResponse } from "next/server";
import { listAllEvents } from "@/lib/engine";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await listAllEvents();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Events could not load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
