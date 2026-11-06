"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ReinventSession, WriteResult } from "@/lib/types";

/**
 * The detail sheet for one session, including the one write the app offers.
 *
 * Saving posts to `/api/favorite`, which writes and then reads the schedule
 * back. The sheet reports exactly what came back: "Saved" only for a save the
 * server could prove, and the server's own reason when it could not. That is the
 * difference between a demo and a tool someone trusts with their calendar.
 */
export function SessionSheet({
  session,
  open,
  onOpenChange,
}: {
  session: ReinventSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);

  if (session === null) return null;

  const level = typeof session.level === "number" ? String(session.level) : session.level;
  const speakers = Array.isArray(session.speakers) ? session.speakers : [];

  async function save() {
    if (session === null) return;
    setSaving(true);
    try {
      const response = await fetch("/api/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = (await response.json()) as WriteResult & { error?: string };
      if (!response.ok) {
        toast.error(data.error === "not signed in" ? "Sign in with `repo-invent login` first." : (data.error ?? "Not saved."));
        return;
      }
      if (data.ok) {
        toast.success("Saved. It is on your account.");
      } else {
        toast.warning(`Not saved: ${describeReason(data.reason ?? "")}`);
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-base leading-snug">{session.title}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-mono">{String(session.start ?? "").slice(0, 16).replace("T", " ")}</span>
              <span>{[session.venue, session.room].filter(Boolean).join(" ")}</span>
              {level ? <Badge variant="outline">{String(level)}</Badge> : null}
              {session.code ? <Badge variant="secondary">{session.code}</Badge> : null}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {speakers.length > 0 ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Speakers: </span>
              {speakers.join(", ")}
            </p>
          ) : null}
          {session.abstract ? <p className="text-sm text-muted-foreground">{session.abstract}</p> : null}

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save to my schedule"}
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Turn the API's short codes into something a person can read. */
function describeReason(reason: string): string {
  if (reason === "sessionFull") return "the room is full.";
  if (reason === "insufficientAccess") return "your registration does not allow reservations.";
  if (reason === "alreadyFavorited") return "it is already on your list.";
  if (reason.length === 0) return "the server refused it.";
  return reason;
}
