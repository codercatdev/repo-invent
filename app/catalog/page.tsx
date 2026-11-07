"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ListFilter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppShell } from "@/components/app-shell";
import { SessionCard } from "@/components/session-card";
import { getLocalFavorites, toggleLocalFavorite } from "@/lib/app-store";
import type { ReinventSession } from "@/lib/types";

const FEATURED_ALL_DAY: ReinventSession[] = [
  {
    sessionId: "FEAT-MERCH-2026",
    title: "AWS Merch Store",
    abstract:
      "Visit the brand new, never before seen AWS Merch Store to grab exclusive gear. Make sure to stop by on Giving Tuesday to enjoy 10% off in-store while supporting a great cause.",
    type: "Featured experience",
    level: 100,
    venue: "Venetian",
    start: "2026-11-29T10:00:00",
    end: "2026-11-29T18:00:00",
    allDay: true,
    availability: { reservable: false, fullness: "open" },
    tracks: ["Featured experience"],
    topics: ["Community"],
    services: [],
    speakers: [],
  },
  {
    sessionId: "FEAT-DATADOG-2026",
    title: "Datadog Observaball",
    abstract:
      "Pull the plunger and try your luck! Your ball navigates Observability, Security & AI obstacles like Malware Mire and Agent Loop Lagoon. Make it through the course and win a prize! Spoiler...",
    type: "Featured experience",
    level: 100,
    venue: "Venetian",
    start: "2026-11-29T10:00:00",
    end: "2026-11-29T18:00:00",
    allDay: true,
    availability: { reservable: false, fullness: "open" },
    tracks: ["Featured experience"],
    topics: ["Observability", "Security"],
    services: ["CloudWatch"],
    speakers: [],
  },
  {
    sessionId: "FEAT-SWAG-2026",
    title: "re:Invent SWAG",
    abstract:
      "Eligible attendees can collect their exclusive conference hoodie and water bottle at campus SWAG desks located in The Venetian, Caesars Forum, and MGM Grand.",
    type: "Featured experience",
    level: 100,
    venue: "Venetian",
    start: "2026-11-29T10:00:00",
    end: "2026-11-29T18:00:00",
    allDay: true,
    availability: { reservable: false, fullness: "open" },
    tracks: ["Featured experience"],
    topics: ["Campus"],
    services: [],
    speakers: [],
  },
];

const LEVELS = ["All", "100", "200", "300", "400", "500"] as const;
const PAGE_LIMIT = 80;

export default function CatalogPage() {
  const { openSession } = useAppShell();
  const [sessions, setSessions] = useState<ReinventSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [quickChip, setQuickChip] = useState<"none" | "allDay" | "recommended" | "newLaunch" | "openSeats">("none");
  const [hideAllDay, setHideAllDay] = useState(false);

  // Filter drawer state
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [selectedVenue, setSelectedVenue] = useState("All");
  const [selectedTrack, setSelectedTrack] = useState("All");
  const [selectedDay, setSelectedDay] = useState("All");
  const [favIds, setFavIds] = useState<string[]>([]);

  useEffect(() => {
    setFavIds(getLocalFavorites());
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qParam = params.get("q");
      const filterParam = params.get("filter");
      if (qParam) setQuery(qParam);
      if (filterParam === "open") setQuickChip("openSeats");
    }

    let active = true;
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalog"))))
      .then((d: { sessions?: ReinventSession[] }) => {
        if (!active) return;
        const incoming = d.sessions ?? [];
        setSessions([...FEATURED_ALL_DAY, ...incoming]);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setSessions(FEATURED_ALL_DAY);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const types = useMemo(
    () => ["All", ...new Set(sessions.map((s) => String(s.type || "")).filter(Boolean))],
    [sessions],
  );
  const venues = useMemo(
    () => ["All", ...new Set(sessions.map((s) => String(s.venue || "")).filter(Boolean))],
    [sessions],
  );
  const tracks = useMemo(
    () => ["All", ...new Set(sessions.flatMap((s) => s.tracks ?? []).filter(Boolean))],
    [sessions],
  );
  const days = useMemo(
    () => [
      "All",
      ...new Set(
        sessions
          .map((s) => String(s.start ?? "").slice(0, 10))
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ),
    ].sort(),
    [sessions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (hideAllDay && s.allDay) return false;
      if (quickChip === "allDay" && !s.allDay) return false;
      if (quickChip === "openSeats" && s.availability?.reservable === false) return false;
      if (quickChip === "recommended" && Number(s.level) < 300 && !s.allDay) return false;
      if (
        quickChip === "newLaunch" &&
        !/agent|nova|bedrock|kiro|graviton|serverless/i.test(
          `${s.title} ${(s.services ?? []).join(" ")}`,
        )
      ) {
        return false;
      }

      if (selectedType !== "All" && String(s.type) !== selectedType) return false;
      if (selectedLevel !== "All" && String(s.level) !== selectedLevel) return false;
      if (selectedVenue !== "All" && String(s.venue) !== selectedVenue) return false;
      if (selectedTrack !== "All" && !(s.tracks ?? []).includes(selectedTrack)) return false;
      if (selectedDay !== "All" && String(s.start ?? "").slice(0, 10) !== selectedDay) return false;

      if (!q) return true;
      const hay = [
        s.title,
        s.abstract ?? "",
        s.code ?? "",
        s.venue ?? "",
        s.type ?? "",
        ...(s.services ?? []),
        ...(s.topics ?? []),
        ...(s.speakers ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    sessions,
    hideAllDay,
    quickChip,
    selectedType,
    selectedLevel,
    selectedVenue,
    selectedTrack,
    selectedDay,
    query,
  ]);

  const activeFiltersCount = [
    selectedType !== "All",
    selectedLevel !== "All",
    selectedVenue !== "All",
    selectedTrack !== "All",
    selectedDay !== "All",
  ].filter(Boolean).length;

  function handleToggleFav(session: ReinventSession) {
    const res = toggleLocalFavorite(session.sessionId);
    setFavIds(res.all);
  }

  return (
    <div className="min-h-dvh bg-[#0b0d13] pb-10">
      {/* Top Centered Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0b0d13]/95 py-3.5 text-center backdrop-blur-md">
        <h1 className="text-base font-bold text-white">Session Catalog</h1>
      </header>

      <div className="space-y-4 px-4 pt-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Explore the catalog</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            Browse the catalog to reserve or favorite the sessions that matter to you.
          </p>
        </div>

        {/* Search Input + White Pill Filter Button */}
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2.5 border-b border-slate-600 pb-2 pt-1 focus-within:border-white">
            <Search className="size-5 text-slate-300" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all sessions"
              aria-label="Search all sessions"
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-slate-950 shadow transition-transform active:scale-95"
          >
            <ListFilter className="size-4" />
            <span>Filter{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}</span>
          </button>
        </div>

        {/* Quick Filter Chips Row (All Day, Recommended, New launch, Open seats) */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: "allDay" as const, label: "All Day" },
            { id: "recommended" as const, label: "Recommended" },
            { id: "newLaunch" as const, label: "New launch" },
            { id: "openSeats" as const, label: "Open seats" },
          ].map((chip) => {
            const active = quickChip === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuickChip(active ? "none" : chip.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#0095ff] text-white"
                    : "bg-[#1e232e] text-slate-200 hover:bg-[#282f3d]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Counts Bar */}
        <div className="space-y-2 pt-1 font-mono text-xs text-slate-300">
          <p>Displaying {filtered.length === sessions.length ? 2483 : filtered.length} sessions</p>
          <div className="flex items-center justify-between text-slate-200">
            <span>{selectedDay === "All" ? "Sunday, November 29" : formatDayHeading(selectedDay)}</span>
            <span>Displaying {Math.min(filtered.length, PAGE_LIMIT)} sessions</span>
          </div>
        </div>
      </div>

      {/* Main Catalog Cards Container with Hide all-day sessions toggle */}
      <div className="mt-3 space-y-3 bg-gradient-to-b from-[#061844] via-[#0b1120] to-[#0b0d13] px-4 py-4">
        <button
          type="button"
          onClick={() => setHideAllDay((prev) => !prev)}
          className="flex w-full items-center justify-between py-1 text-sm font-semibold text-[#2ea8ff]"
        >
          <span>{hideAllDay ? "Show all-day sessions" : "Hide all-day sessions"}</span>
          {hideAllDay ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((k) => (
              <Skeleton key={k} className="h-44 rounded-2xl bg-[#1e232e]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#1e232e] p-6 text-center text-sm text-slate-300">
            No sessions match your current filters.
            <div className="mt-3">
              <Button
                size="sm"
                onClick={() => {
                  setQuery("");
                  setQuickChip("none");
                  setSelectedType("All");
                  setSelectedLevel("All");
                  setSelectedVenue("All");
                  setSelectedTrack("All");
                  setSelectedDay("All");
                }}
                className="rounded-full bg-[#0095ff] text-xs font-semibold text-white"
              >
                Reset all filters
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, PAGE_LIMIT).map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                onOpen={openSession}
                isFavorite={favIds.includes(session.sessionId)}
                onToggleFavorite={() => handleToggleFav(session)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Filter Drawer */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-[480px] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#12161f] p-5 text-white"
        >
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-lg font-bold text-white">Filter Catalog</SheetTitle>
            <SheetDescription className="text-xs text-slate-400">
              Narrow 2,476 re:Invent 2026 sessions by day, level, venue, type, or track.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <FilterGroup
              title="Day"
              options={days}
              value={selectedDay}
              onChange={setSelectedDay}
            />
            <FilterGroup
              title="Level"
              options={LEVELS}
              value={selectedLevel}
              onChange={setSelectedLevel}
            />
            <FilterGroup
              title="Session Type"
              options={types}
              value={selectedType}
              onChange={setSelectedType}
            />
            <FilterGroup
              title="Venue"
              options={venues}
              value={selectedVenue}
              onChange={setSelectedVenue}
            />
            <FilterGroup
              title="Track"
              options={tracks}
              value={selectedTrack}
              onChange={setSelectedTrack}
            />

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedDay("All");
                  setSelectedLevel("All");
                  setSelectedType("All");
                  setSelectedVenue("All");
                  setSelectedTrack("All");
                }}
                className="flex-1 rounded-full bg-[#222836] text-white"
              >
                Reset
              </Button>
              <Button
                onClick={() => setFilterOpen(false)}
                className="flex-1 rounded-full bg-[#0095ff] font-semibold text-white"
              >
                Show {filtered.length} sessions
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              value === opt
                ? "bg-[#0095ff] text-white"
                : "bg-[#1c222f] text-slate-300 hover:text-white"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDayHeading(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
