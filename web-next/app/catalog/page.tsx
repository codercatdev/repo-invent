"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionCard } from "@/components/session-card";
import { SessionSheet } from "@/components/session-sheet";
import { cn } from "@/lib/utils";
import type { ReinventSession } from "@/lib/types";

/**
 * The catalog.
 *
 * 2,279 sessions is too many to scroll, so the page narrows before it draws:
 * a text search, then the four filters that actually separate sessions — type,
 * level, venue and track. The first 60 matches are drawn and the page says so,
 * because rendering the whole catalog costs more than it informs.
 */

const LEVELS = ["All", "100", "200", "300", "400", "500"] as const;
const PAGE = 60;

function levelOf(session: ReinventSession): string {
  if (typeof session.level === "number") return String(session.level);
  const match = /(\d{3})/.exec(String(session.level ?? ""));
  return match === null ? "" : match[1];
}

/** One horizontal row of filter chips. */
function ChipRow({
  values,
  current,
  onPick,
  label,
}: {
  values: readonly string[];
  current: string;
  onPick: (value: string) => void;
  label: string;
}) {
  return (
    <ScrollArea className="w-full whitespace-nowrap" aria-label={label}>
      <div className="flex gap-2 pb-2">
        {values.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={value === current ? "default" : "secondary"}
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            aria-pressed={value === current}
            onClick={() => onPick(value)}
          >
            {value}
          </Button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

export default function CataloguePage() {
  const [sessions, setSessions] = useState<CatalogState>({ status: "loading", sessions: [] });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [level, setLevel] = useState("All");
  const [venue, setVenue] = useState("All");
  const [track, setTrack] = useState("All");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReinventSession | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/catalog")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog"))))
      .then((data: { sessions: ReinventSession[] }) => {
        if (live) setSessions({ status: "ready", sessions: data.sessions ?? [] });
      })
      .catch(() => {
        if (live) setSessions({ status: "failed", sessions: [] });
      });
    return () => {
      live = false;
    };
  }, []);

  const all = sessions.sessions;

  const types = useMemo(() => ["All", ...unique(all.map((session) => String(session.type ?? "")))], [all]);
  const venues = useMemo(
    () => ["All", ...unique(all.map((session) => String(session.venue ?? ""))).sort((a, b) => a.localeCompare(b))],
    [all],
  );
  const tracks = useMemo(
    () => ["All", ...unique(all.flatMap((session) => session.tracks ?? [])).sort((a, b) => a.localeCompare(b))],
    [all],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((session) => {
      if (type !== "All" && String(session.type ?? "") !== type) return false;
      if (level !== "All" && levelOf(session) !== level) return false;
      if (venue !== "All" && String(session.venue ?? "") !== venue) return false;
      if (track !== "All" && !(session.tracks ?? []).includes(track)) return false;
      if (needle.length === 0) return true;
      return [session.title, ...(session.services ?? []), ...(session.topics ?? []), session.code ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [all, level, query, track, type, venue]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Catalog</h1>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search title, service or topic"
        aria-label="Search sessions"
        type="search"
      />

      <div className="space-y-1">
        <ChipRow values={types} current={type} onPick={setType} label="Filter by type" />
        <ChipRow values={LEVELS} current={level} onPick={setLevel} label="Filter by level" />
        <ChipRow values={venues} current={venue} onPick={setVenue} label="Filter by venue" />
        <ChipRow values={tracks} current={track} onPick={setTrack} label="Filter by track" />
      </div>

      {sessions.status === "loading" ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-[70px] rounded-xl" />
          ))}
        </div>
      ) : sessions.status === "failed" ? (
        <p className="text-sm text-muted-foreground">The catalog could not load. Try again in a moment.</p>
      ) : (
        <>
          <p className={cn("text-xs text-muted-foreground")}>
            {rows.length} of {all.length} sessions
          </p>
          <div className="space-y-2">
            {rows.slice(0, PAGE).map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                onOpen={(picked) => {
                  setSelected(picked);
                  setOpen(true);
                }}
              />
            ))}
          </div>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matches that.</p> : null}
          {rows.length > PAGE ? (
            <p className="pb-2 text-xs text-muted-foreground">
              Showing the first {PAGE}. Type in the search to narrow it.
            </p>
          ) : null}
        </>
      )}

      <SessionSheet session={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}

interface CatalogState {
  status: "loading" | "ready" | "failed";
  sessions: ReinventSession[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
