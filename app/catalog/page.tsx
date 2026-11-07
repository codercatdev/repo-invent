"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ListFilter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
const PAGE_LIMIT = 90;

export default function CatalogPage() {
  const { openSession } = useAppShell();
  const [sessions, setSessions] = useState<ReinventSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [quickChip, setQuickChip] = useState<
    "none" | "allDay" | "recommended" | "newLaunch" | "openSeats"
  >("none");
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
    () =>
      [
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
    <div className="space-y-6 pb-10">
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-black tracking-tight">Explore the Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Browse {sessions.length > 3 ? sessions.length.toLocaleString() : "2,483"} sessions to
          reserve or favorite the talks that matter to you.
        </p>
      </div>

      {/* Search Input + Tactile Filter Button */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all sessions, AWS services, speakers, or codes..."
            aria-label="Search all sessions"
            className="h-11 pl-10"
          />
        </div>

        <Button variant="secondary" size="lg" onClick={() => setFilterOpen(true)}>
          <ListFilter className="size-4" />
          <span>Filter{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}</span>
        </Button>
      </div>

      {/* Quick Filter Chips Row */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "allDay" as const, label: "All Day" },
          { id: "recommended" as const, label: "Recommended" },
          { id: "newLaunch" as const, label: "New launch" },
          { id: "openSeats" as const, label: "Open seats" },
        ].map((chip) => {
          const active = quickChip === chip.id;
          return (
            <Button
              key={chip.id}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => setQuickChip(active ? "none" : chip.id)}
            >
              {chip.label}
            </Button>
          );
        })}
      </div>

      {/* Counts + Hide All-Day Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border pb-3 font-mono text-xs font-bold text-muted-foreground">
        <span>
          Displaying {filtered.length.toLocaleString()} sessions (
          {selectedDay === "All" ? "Nov 29 – Dec 4" : formatDayHeading(selectedDay)})
        </span>
        <button
          type="button"
          onClick={() => setHideAllDay((prev) => !prev)}
          className="inline-flex items-center gap-1 font-sans text-xs font-extrabold text-primary hover:underline"
        >
          <span>{hideAllDay ? "Show all-day sessions" : "Hide all-day sessions"}</span>
          {hideAllDay ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>

      {/* Responsive Multi-Column Session Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Skeleton key={k} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-tactile p-8 text-center">
          <p className="font-heading text-base font-extrabold">
            No sessions match your current filters.
          </p>
          <div className="mt-4">
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
            >
              Reset all filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

      {/* Filter Drawer */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-2xl overflow-y-auto rounded-t-3xl border-t-2 border-border bg-background p-5 text-foreground"
        >
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="font-heading text-lg font-black">Filter Catalog</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Narrow 2,476 re:Invent 2026 sessions by day, level, venue, type, or track.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <FilterGroup title="Day" options={days} value={selectedDay} onChange={setSelectedDay} />
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

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDay("All");
                  setSelectedLevel("All");
                  setSelectedType("All");
                  setSelectedVenue("All");
                  setSelectedTrack("All");
                }}
                className="flex-1"
              >
                Reset
              </Button>
              <Button onClick={() => setFilterOpen(false)} className="flex-1">
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
      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Button
            key={opt}
            size="xs"
            variant={value === opt ? "default" : "outline"}
            onClick={() => onChange(opt)}
          >
            {opt}
          </Button>
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
