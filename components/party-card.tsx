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
    <div className="card-tactile flex flex-col justify-between p-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-xs font-bold">
              {party.day} • {party.date}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs font-semibold">
              <Clock className="mr-1 size-3" />
              {party.timeLabel || "Evening"}
            </Badge>
          </div>
          {party.atCapacity ? (
            <Badge variant="destructive" className="text-[10px] font-bold">
              At capacity
            </Badge>
          ) : (
            <Badge className="bg-primary/15 text-[10px] font-bold text-primary">
              RSVP Open
            </Badge>
          )}
        </div>

        <h3 className="font-heading text-base font-extrabold leading-snug text-foreground">
          {party.title}
        </h3>

        {sponsors.length > 0 ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <span>Hosted by {sponsors.join(", ")}</span>
          </p>
        ) : null}

        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span>{place}</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {party.url ? (
          <Button
            size="sm"
            onClick={() => window.open(party.url ?? "", "_blank", "noopener,noreferrer")}
          >
            RSVP
            <ExternalLink className="size-3" />
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.open(party.mapUrl, "_blank", "noopener,noreferrer")}
        >
          Map
          <ExternalLink className="size-3" />
        </Button>
        <Button size="sm" variant="outline" onClick={handleAddToCalendar}>
          <CalendarPlus className="size-3.5" />
          + Calendar
        </Button>
      </div>
    </div>
  );
}
