import { NextResponse } from "next/server";
import { mySchedule } from "@/lib/engine";

/**
 * The attendee's own schedule.
 *
 * The engine reads `GetSchedule` and joins titles from the catalog. A missing
 * sign-in is a normal state the page renders, not a fault, so it answers 401
 * with a plain reason the UI can show.
 */
export const runtime = "nodejs";

const SIGNED_OUT = /not signed in|no_tokens|sign in again|refresh token/i;

export async function GET() {
  try {
    const schedule = await mySchedule();
    return NextResponse.json(schedule, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The schedule could not load.";
    if (SIGNED_OUT.test(message)) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
