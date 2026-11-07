"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PartyPopper, Search } from "lucide-react";
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
    <div className="min-h-dvh bg-[#0b0d13] pb-10">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0b0d13]/95 py-3.5 text-center backdrop-blur-md">
        <h1 className="text-base font-bold text-white">re:Invent Parties</h1>
      </header>

      <div className="space-y-4 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
              <PartyPopper className="size-6 text-[#9b8afb]" />
              <span>171 Vegas Parties</span>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Scraped & enriched from conferenceparties.com/reinvent2026 across 6 nights.
            </p>
          </div>
          <a
            href="https://conferenceparties.com/reinvent2026/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-[#181d27] px-3 py-1.5 text-[11px] font-medium text-[#2ea8ff] hover:underline"
          >
            Source <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2.5 border-b border-slate-600 pb-2 pt-1 focus-within:border-white">
          <Search className="size-5 text-slate-300" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sponsor, restaurant, club, or party name"
            aria-label="Search parties"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        {/* Day Selector Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {PARTY_DAYS.map((d) => {
            const active = selectedDate === d.date;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDate(d.date)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#0095ff] text-white"
                    : "bg-[#1e232e] text-slate-300 hover:text-white"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Venue Hub Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {VENUE_HUBS.map((hub) => {
            const active = selectedHub === hub;
            return (
              <button
                key={hub}
                type="button"
                onClick={() => setSelectedHub(hub)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-[#9b8afb] bg-[#9b8afb]/20 text-white"
                    : "border-white/10 bg-[#141822] text-slate-400 hover:text-white"
                }`}
              >
                {hub}
              </button>
            );
          })}
        </div>

        <p className="font-mono text-xs text-slate-400">
          Displaying {filtered.length} of {parties?.length ?? 171} parties
        </p>

        {parties === null ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((k) => (
              <Skeleton key={k} className="h-36 rounded-2xl bg-[#1e232e]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#1e232e] p-6 text-center text-sm text-slate-300">
            No parties match that filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((party) => (
              <PartyCard
                key={`${party.date}-${party.title}-${party.timeLabel}`}
                party={party}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
