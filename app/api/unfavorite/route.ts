import { NextResponse } from "next/server";
import { unfavoriteSession } from "@/lib/engine";

/**
 * Remove a saved session.
 *
 * `unfavoriteSession` deletes, then reads the schedule back, and reports
 * `removed` only when the session is really gone. A reserved seat is left alone:
 * cancelling that is a different promise, handled by the CLI.
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
    const result = await unfavoriteSession(sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The removal failed.";
    if (SIGNED_OUT.test(message)) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
