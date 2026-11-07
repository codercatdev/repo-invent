"use client";

import { Calendar, Clock, Heart, MapPin, Timer } from "lucide-react";
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
        "group relative rounded-2xl border border-white/[0.06] bg-[#1e232e] p-4 text-left transition-all",
        onOpen ? "cursor-pointer hover:border-[#9b8afb]/40 hover:bg-[#232936]" : "",
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-[#10131a] px-2.5 py-1 font-mono text-xs text-slate-200">
            {String(session.type || "Featured experience")}
          </span>
          {!reservable ? (
            <span className="rounded-md bg-[#003687]/80 px-2 py-0.5 font-mono text-[11px] text-blue-200">
              Walk-up
            </span>
          ) : (
            <span className="rounded-md bg-emerald-950/80 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
              Open seats
            </span>
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
            className="flex size-8 items-center justify-center rounded-full bg-[#12161f] text-slate-300 transition-colors hover:text-white"
          >
            <Heart className={cn("size-4", isFavorite ? "fill-rose-500 text-rose-500" : "")} />
          </button>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-slate-300">
        <span className="inline-flex items-center gap-1">
          <Calendar className="size-3.5 text-slate-400" />
          {day}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5 text-slate-400" />
          {formatClock(session.start)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer className="size-3.5 text-slate-400" />
          {formatDuration(session)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5 text-slate-400" />
          {shortVenue(session.venue)}
        </span>
      </div>

      <h3 className="mb-1.5 text-base font-bold leading-snug text-white group-hover:text-[#9b8afb]">
        {session.title}
      </h3>

      <p className="line-clamp-3 text-sm leading-relaxed text-slate-300">
        {session.abstract || fallbackDesc}
      </p>
    </div>
  );
}
