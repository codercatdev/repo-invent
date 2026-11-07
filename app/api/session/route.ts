import { NextResponse } from "next/server";
import { endSignIn, sessionStatus } from "@/lib/engine";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await sessionStatus();
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status check failed.";
    return NextResponse.json({ signedIn: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await endSignIn();
    return NextResponse.json({ signedIn: false, signedOut: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign out failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
