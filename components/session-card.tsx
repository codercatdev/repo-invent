"use client";

import { Calendar, Clock, Heart, MapPin, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReinventSession } from "@/lib/types";

function formatClock(start: string | undefined): string {
  const s = String(start ?? "");
  const m = /T(\d{2}):(\d{2})/.exec(s);
  if (!m) return "10:00 AM";
  const h = Number(m[1]);
  const min = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${min} ${suffix}`;
}

function formatDuration(session: ReinventSession): string {
  if (session.allDay) return "All Day";
  const a = Date.parse(String(session.start ?? ""));
  const b = Date.parse(String(session.end ?? ""));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "60 min";
  const mins = Math.round((b - a) / 60000);
  if (mins >= 300) return "All Day";
  return `${mins} min`;
}

function shortVenue(venue: string | undefined): string {
  const v = String(venue ?? "Venetian").replace(/^The\s+/i, "");
  return v || "Venetian";
}

export function SessionCard({
  session,
  onOpen,
  isFavorite = false,
  onToggleFavorite,
}: {
  session: ReinventSession;
  onOpen?: (session: ReinventSession) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (session: ReinventSession, event: React.MouseEvent) => void;
}) {
  const day = String(session.start ?? "").slice(0, 10) || "2026-11-30";
  const reservable = session.availability?.reservable !== false;
  const fallbackDesc = [
    session.code ? `${session.code}` : null,
    session.level ? `Level ${session.level}` : null,
    session.services?.length ? `AWS Services: ${session.services.join(", ")}` : null,
    session.speakers?.length ? `Speakers: ${session.speakers.join(", ")}` : null,
    session.room ? `Room: ${session.room}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(session) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(session);
              }
            }
          : undefined
      }
      className={cn(
        "card-tactile flex flex-col justify-between p-4 text-left",
        onOpen ? "card-tactile-interactive hover:border-primary/60" : "",
      )}
    >
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-xs font-bold">
              {String(session.type || "Featured experience")}
            </Badge>
            {!reservable ? (
              <Badge variant="outline" className="font-mono text-[11px] font-bold">
                Walk-up
              </Badge>
            ) : (
              <Badge className="bg-primary/15 font-mono text-[11px] font-bold text-primary border-primary/30">
                Open seats
              </Badge>
            )}
          </div>
          {onToggleFavorite ? (
            <button
              type="button"
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(session, e);
              }}
              className="btn-tactile flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:text-destructive"
            >
              <Heart
                className={cn(
                  "size-4 transition-transform",
                  isFavorite ? "scale-110 fill-destructive text-destructive" : "",
                )}
              />
            </button>
          ) : null}
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5" />
            {day}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatClock(session.start)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" />
            {formatDuration(session)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {shortVenue(session.venue)}
          </span>
        </div>

        <h3 className="mb-1.5 font-heading text-base font-extrabold leading-snug text-foreground">
          {session.title}
        </h3>
      </div>

      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {session.abstract || fallbackDesc}
      </p>
    </div>
  );
}
