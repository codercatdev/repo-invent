"use client";

import { toast } from "sonner";
import { CalendarPlus, Clock, ExternalLink, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addLocalBlock } from "@/lib/app-store";
import type { Party } from "@/lib/types";

export function PartyCard({ party }: { party: Party }) {
  const sponsors = Array.isArray(party.sponsors) ? party.sponsors : [];
  const place = party.address ? `${party.venue} • ${party.address}` : party.venue || party.location;

  function handleAddToCalendar() {
    const startIso = party.start ?? `${party.date}T19:00:00`;
    const endIso = party.end ?? `${party.date}T21:30:00`;
    addLocalBlock({
      title: `🎉 ${party.title}`,
      start: startIso,
      end: endIso,
      venue: place,
    });
    toast.success(`Added "${party.title}" to your ${party.day} calendar!`);
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#1e232e] p-4 transition-colors hover:border-[#9b8afb]/40">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-[#10131a] px-2.5 py-1 font-mono text-xs text-[#9b8afb]">
            {party.day} • {party.date}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-[#141923] px-2 py-1 font-mono text-xs text-slate-200">
            <Clock className="size-3 text-slate-400" />
            {party.timeLabel || "Evening"}
          </span>
        </div>
        {party.atCapacity ? (
          <Badge variant="outline" className="border-rose-500/40 text-[10px] text-rose-300">
            At capacity
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-300">
            RSVP Open
          </Badge>
        )}
      </div>

      <h3 className="text-base font-bold leading-snug text-white">{party.title}</h3>

      {sponsors.length > 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
          <Sparkles className="size-3.5 shrink-0 text-[#9b8afb]" />
          <span>Hosted by {sponsors.join(", ")}</span>
        </p>
      ) : null}

      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-300">
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
        <span>{place}</span>
      </p>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {party.url ? (
          <Button
            size="sm"
            onClick={() => window.open(party.url ?? "", "_blank", "noopener,noreferrer")}
            className="h-8 rounded-full bg-[#0095ff] px-3.5 text-xs font-semibold text-white hover:bg-[#0095ff]/90"
          >
            RSVP Page
            <ExternalLink className="ml-1 size-3" />
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.open(party.mapUrl, "_blank", "noopener,noreferrer")}
          className="h-8 rounded-full bg-[#262c3a] px-3 text-xs text-slate-200 hover:bg-[#303748]"
        >
          Map
          <ExternalLink className="ml-1 size-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAddToCalendar}
          className="h-8 rounded-full border border-white/10 bg-[#141822] px-3 text-xs text-[#9b8afb] hover:bg-[#1d2331]"
        >
          <CalendarPlus className="mr-1 size-3.5" />
          Add to Calendar
        </Button>
      </div>
    </div>
  );
}
