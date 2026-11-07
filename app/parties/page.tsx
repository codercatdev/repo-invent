"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PartyPopper, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PartyCard } from "@/components/party-card";
import type { Party } from "@/lib/types";

const PARTY_DAYS = [
  { date: "All", label: "All (171)" },
  { date: "2026-11-29", label: "Sun 29" },
  { date: "2026-11-30", label: "Mon 30" },
  { date: "2026-12-01", label: "Tue 1" },
  { date: "2026-12-02", label: "Wed 2" },
  { date: "2026-12-03", label: "Thu 3" },
  { date: "2026-12-04", label: "Fri 4" },
] as const;

const VENUE_HUBS = [
  "All Venues",
  "Venetian",
  "Palazzo",
  "Caesars",
  "Wynn",
  "Cosmopolitan",
  "Bellagio",
  "Sphere",
] as const;

export default function PartiesPage() {
  const [parties, setParties] = useState<Party[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("All");
  const [selectedHub, setSelectedHub] = useState<string>("All Venues");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/parties")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("parties"))))
      .then((d: { parties?: Party[] }) => {
        if (!live) return;
        setParties(d.parties ?? []);
      })
      .catch(() => {
        if (live) setParties([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (parties ?? []).filter((p) => {
      if (selectedDate !== "All" && p.date !== selectedDate) return false;
      if (selectedHub !== "All Venues") {
        const loc = `${p.venue} ${p.location}`.toLowerCase();
        if (!loc.includes(selectedHub.toLowerCase())) return false;
      }
      if (!q) return true;
      const hay = [p.title, p.venue, p.location, p.address ?? "", ...(p.sponsors ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [parties, selectedDate, selectedHub, query]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading flex items-center gap-2.5 text-3xl font-black tracking-tight">
            <PartyPopper className="size-7 text-primary" />
            <span>171 Vegas Parties</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scraped & enriched from conferenceparties.com/reinvent2026 across 6 nights.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            window.open("https://conferenceparties.com/reinvent2026/", "_blank", "noopener")
          }
        >
          conferenceparties.com <ExternalLink className="size-3.5" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sponsor, restaurant, club, or party name..."
          aria-label="Search parties"
          className="h-11 pl-10"
        />
      </div>

      {/* Day Selector Pills */}
      <div className="flex flex-wrap gap-2">
        {PARTY_DAYS.map((d) => {
          const active = selectedDate === d.date;
          return (
            <Button
              key={d.date}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => setSelectedDate(d.date)}
            >
              {d.label}
            </Button>
          );
        })}
      </div>

      {/* Venue Hub Chips */}
      <div className="flex flex-wrap gap-1.5">
        {VENUE_HUBS.map((hub) => {
          const active = selectedHub === hub;
          return (
            <Button
              key={hub}
              size="xs"
              variant={active ? "secondary" : "ghost"}
              onClick={() => setSelectedHub(hub)}
            >
              {hub}
            </Button>
          );
        })}
      </div>

      <p className="font-mono text-xs font-bold text-muted-foreground">
        Displaying {filtered.length} of {parties?.length ?? 171} parties
      </p>

      {parties === null ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Skeleton key={k} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-tactile p-8 text-center text-sm font-bold text-muted-foreground">
          No parties match that filter.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((party) => (
            <PartyCard
              key={`${party.date}-${party.title}-${party.timeLabel}`}
              party={party}
            />
          ))}
        </div>
      )}
    </div>
  );
}
