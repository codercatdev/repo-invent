import { NextResponse } from "next/server";
import { addPersonalTime, removePersonalTime } from "@/lib/engine";

/**
 * Block time on the attendee's calendar, or remove a block.
 *
 * The API wants local time (no offset), seconds at `00`, whole five-minute
 * steps, and a description of 1 to 250 characters. A form cannot be trusted to
 * produce that, so the values are normalised here and a bad request is refused
 * with a sentence a person can act on.
 */
export const runtime = "nodejs";

const SIGNED_OUT = /not signed in|no_tokens|sign in again|refresh token/i;

interface BlockBody {
  title?: unknown;
  start?: unknown;
  end?: unknown;
  location?: unknown;
  personalId?: unknown;
}

/**
 * Turn a `datetime-local` value into the shape the API wants, or null.
 *
 * Seconds are set to `00` and the minute is snapped to the nearest five, which
 * is the only granularity the API accepts. Rounding up from `:58` carries into
 * the hour, so that is handled rather than producing `:60`.
 */
export function toApiTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (match === null) return null;
  const year = match[1];
  const month = match[2];
  const day = match[3];
  let hour = Number(match[4]);
  let minute = Math.round(Number(match[5]) / 5) * 5;
  if (minute === 60) {
    minute = 0;
    hour += 1;
  }
  if (hour > 23) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${month}-${day}T${pad(hour)}:${pad(minute)}:00`;
}

export async function POST(request: Request) {
  let body: BlockBody;
  try {
    body = (await request.json()) as BlockBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // One route, two intents: a removal names an existing block, a creation
  // describes a new one. Naming the block wins, so the client cannot create an
  // empty block by sending both.
  if (typeof body.personalId === "string" && body.personalId.length > 0) {
    try {
      return NextResponse.json(await removePersonalTime(body.personalId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The block could not be removed.";
      if (SIGNED_OUT.test(message)) {
        return NextResponse.json({ error: "not signed in" }, { status: 401 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const start = toApiTime(body.start);
  const end = toApiTime(body.end);
  if (title.length === 0) {
    return NextResponse.json({ error: "Give the block a name." }, { status: 400 });
  }
  if (start === null || end === null) {
    return NextResponse.json({ error: "Pick a start and an end." }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "The end has to come after the start." }, { status: 400 });
  }

  try {
    const result = await addPersonalTime({
      title: title.slice(0, 128),
      start,
      end,
      ...(typeof body.location === "string" && body.location.length > 0
        ? { location: body.location.slice(0, 255) }
        : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The block could not be saved.";
    if (SIGNED_OUT.test(message)) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
