import { NextResponse } from "next/server";
import { favoriteSession } from "@/lib/engine";

/**
 * Save a session to the attendee's account.
 *
 * `favoriteSession` writes, then reads `GetSchedule` back, and reports success
 * only for a favourite it actually saw. The answer here carries that verdict
 * unchanged: the UI must never claim a save it cannot prove.
 */
export const runtime = "nodejs";

const SIGNED_OUT = /not signed in|no_tokens|sign in again/i;

export async function POST(request: Request) {
  let sessionId: unknown;
  try {
    sessionId = ((await request.json()) as { sessionId?: unknown }).sessionId;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return NextResponse.json({ error: "A session id is required." }, { status: 400 });
  }

  try {
    const result = await favoriteSession(sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The save failed.";
    if (SIGNED_OUT.test(message)) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
