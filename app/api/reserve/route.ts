import { NextResponse } from "next/server";
import { cancelReservationById, reserveSession } from "@/lib/engine";

export const runtime = "nodejs";

const SIGNED_OUT = /not signed in|no_tokens|sign in again/i;

export async function POST(request: Request) {
  let body: { sessionId?: unknown; cancel?: unknown };
  try {
    body = (await request.json()) as { sessionId?: unknown; cancel?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof body.sessionId !== "string" || body.sessionId.length === 0) {
    return NextResponse.json({ error: "A session id is required." }, { status: 400 });
  }

  try {
    if (body.cancel === true) {
      const result = await cancelReservationById(body.sessionId);
      return NextResponse.json(result);
    }
    const result = await reserveSession(body.sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reservation action failed.";
    if (SIGNED_OUT.test(message)) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
