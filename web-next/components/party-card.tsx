"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Party } from "@/lib/types";

/**
 * One party, with the two links that actually matter: the organiser's RSVP page
 * and a map.
 *
 * The listing is an unofficial community scrape, so the card always points at
 * the sponsor's own page rather than presenting itself as authoritative.
 */
export function PartyCard({ party }: { party: Party }) {
  const sponsors = Array.isArray(party.sponsors) ? party.sponsors : [];
  const place = party.address ? `${party.venue} · ${party.address}` : party.venue || party.location;

  return (
    <Card className="gap-2 border-border/60 bg-card/65 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug">{party.title}</h3>
        {party.atCapacity ? (
          <Badge variant="outline" className="border-red-500/40 text-[10px] text-red-400">
            at capacity
          </Badge>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-mono">{party.timeLabel}</span>
        {sponsors.length > 0 ? <> · {sponsors.join(", ")}</> : null}
      </p>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <MapPin className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{place}</span>
      </p>

      <div className="flex gap-2 pt-1">
        {party.url ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 text-xs"
            onClick={() => window.open(party.url ?? "", "_blank", "noopener,noreferrer")}
          >
            RSVP
            <ExternalLink className="size-3" aria-hidden />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">No link listed</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          onClick={() => window.open(party.mapUrl, "_blank", "noopener,noreferrer")}
        >
          Map
          <ExternalLink className="size-3" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}
