"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReinventSession } from "@/lib/types";

/**
 * One session, as a row you can tap.
 *
 * The availability badge is deliberately coarse. The catalog reports only
 * whether a session can be reserved, never a remaining count, so a card says
 * "reservable" or "walk-up" and never invents a number of seats.
 */
function availabilityOf(session: ReinventSession): { label: string; className: string } {
  const availability = session.availability;
  if (availability !== undefined && availability.reservable === false) {
    return { label: "walk-up", className: "border-amber-500/40 text-amber-400" };
  }
  return { label: "reservable", className: "border-emerald-500/40 text-emerald-400" };
}

/** The clock part of an ISO date, or a plain fallback for an empty field. */
function timeOf(start: string | undefined): string {
  const value = String(start ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return "time to be set";
  return value.slice(11, 16);
}

export function SessionCard({
  session,
  onOpen,
  showDay = true,
}: {
  session: ReinventSession;
  onOpen?: (session: ReinventSession) => void;
  showDay?: boolean;
}) {
  const availability = availabilityOf(session);
  const day = String(session.start ?? "").slice(0, 10);

  return (
    <Card
      role={onOpen === undefined ? undefined : "button"}
      tabIndex={onOpen === undefined ? undefined : 0}
      onClick={onOpen === undefined ? undefined : () => onOpen(session)}
      onKeyDown={
        onOpen === undefined
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(session);
              }
            }
      }
      className={cn(
        "gap-2 border-border/70 bg-card/70 p-3.5 transition-colors",
        onOpen === undefined ? "" : "cursor-pointer hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <p className="text-sm font-medium leading-snug">{session.title}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {showDay && day.length > 0 ? <span className="font-mono">{day}</span> : null}
        <span className="font-mono">{timeOf(session.start)}</span>
        <span>{[session.venue, session.room].filter(Boolean).join(" ")}</span>
        <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", availability.className)}>
          {availability.label}
        </Badge>
      </div>
    </Card>
  );
}
