"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarEntry, WriteResult } from "@/lib/types";

/**
 * The calendar.
 *
 * A signed-out visitor is not shown an empty promise: the page says the account
 * is not connected and what to run. Booked items appear only after the API
 * returns them, and every removal waits for the server to confirm the entry is
 * gone before it leaves the screen.
 */
type Load =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "ready"; entries: CalendarEntry[] };

export default function CalendarPage() {
  const [state, setState] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    // The calendar belongs to the account, so it is read once on mount. The
    // first paint is the skeleton; this only settles state from the response.
    let live = true;
    void loadCalendar().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  async function refresh() {
    const next = await loadCalendar();
    setState(next);
  }

  async function remove(entry: CalendarEntry) {
    setBusy(entry.id);
    try {
      const response = await fetch(
        entry.kind === "blocked" ? "/api/personal-time" : "/api/unfavorite",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            entry.kind === "blocked" ? { personalId: entry.id } : { sessionId: entry.id },
          ),
        },
      );
      const data = (await response.json()) as WriteResult & { error?: string; removed?: boolean };
      const done = data.ok === true || data.removed === true;
      if (!response.ok || !done) {
        toast.error(data.error ?? "The server did not confirm the removal.");
        return;
      }
      await refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function block() {
    if (title.trim().length === 0 || start.length === 0 || end.length === 0) {
      toast.error("Give the block a name, a start and an end.");
      return;
    }
    setBusy("new");
    try {
      const response = await fetch("/api/personal-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), start, end }),
      });
      const data = (await response.json()) as WriteResult & { error?: string };
      if (!response.ok || data.ok !== true) {
        toast.error(data.error ?? "The server did not confirm the block.");
        return;
      }
      setTitle("");
      setStart("");
      setEnd("");
      toast.success("Blocked.");
      await refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const byDay = groupByDay(state.state === "ready" ? state.entries : []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>

      {state.state === "loading" ? (
        <div className="space-y-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : state.state === "signed-out" ? (
        <Card className="gap-2 bg-card/60 p-4">
          <p className="text-sm font-medium">Not connected to an account</p>
          <p className="text-xs text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">repo-invent login</code>{" "}
            in a terminal, then reload. AWS accepts only a loopback redirect, so a web page cannot start
            the sign-in itself.
          </p>
        </Card>
      ) : state.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing booked yet. Save a session from the catalog to fill this in.
        </p>
      ) : (
        <div className="space-y-5">
          {byDay.map(([day, entries]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground">{niceDay(day)}</h2>
              {entries.map((entry) => (
                <Card key={entry.id} className="flex-row items-start justify-between gap-3 border-border/70 bg-card/60 p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">{entry.start.slice(11, 16)}</span>
                      <span>{entry.venue}</span>
                      <Badge
                        variant="outline"
                        className={
                          entry.kind === "reserved"
                            ? "text-[10px] text-emerald-400"
                            : entry.kind === "blocked"
                              ? "text-[10px] text-amber-400"
                              : "text-[10px]"
                        }
                      >
                        {entry.kind}
                      </Badge>
                    </p>
                  </div>
                  {entry.kind === "reserved" ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 text-xs text-destructive"
                      disabled={busy === entry.id}
                      onClick={() => void remove(entry)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remove
                    </Button>
                  )}
                </Card>
              ))}
            </section>
          ))}
        </div>
      )}

      {state.state === "ready" ? (
        <Card className="gap-3 border-border/70 bg-card/60 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarPlus className="size-4" aria-hidden />
            Block time
          </p>
          <div className="grid gap-2">
            <Label htmlFor="block-title" className="text-xs">
              What for
            </Label>
            <Input
              id="block-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Walk to the Venetian"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="block-start" className="text-xs">
                Start
              </Label>
              <Input
                id="block-start"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="block-end" className="text-xs">
                End
              </Label>
              <Input
                id="block-end"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => void block()} disabled={busy === "new"}>
            {busy === "new" ? "Blocking…" : "Block this time"}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

/** The API joins titles onto ids, so a title can be missing. */
function toEntry(
  entry: { sessionId: string; title?: string; start?: string; end?: string; venue?: string; room?: string },
  kind: "reserved" | "saved",
): CalendarEntry {
  return {
    id: entry.sessionId,
    title: entry.title ?? entry.sessionId,
    start: entry.start ?? "",
    end: entry.end ?? "",
    venue: [entry.venue, entry.room].filter(Boolean).join(" "),
    kind,
  };
}

function groupByDay(entries: CalendarEntry[]): Array<[string, CalendarEntry[]]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const day = entry.start.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), entry]);
  }
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function niceDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Read the calendar and shape it. Pure: it never touches React state. */
async function loadCalendar(): Promise<Load> {
  try {
    const response = await fetch("/api/schedule");
    if (response.status === 401) return { state: "signed-out" };
    if (!response.ok) return { state: "signed-out" };
    const data = (await response.json()) as {
      favorites?: Array<{ sessionId: string; title?: string; start?: string; end?: string; venue?: string; room?: string }>;
      reserved?: Array<{ sessionId: string; title?: string; start?: string; end?: string; venue?: string; room?: string }>;
      personalTime?: Array<{ personalTimeId: string; title?: string; startDateTime?: string; endDateTime?: string; location?: string }>;
    };
    const entries: CalendarEntry[] = [
      ...(data.reserved ?? []).map((entry) => toEntry(entry, "reserved")),
      ...(data.favorites ?? []).map((entry) => toEntry(entry, "saved")),
      ...(data.personalTime ?? []).map((entry) => ({
        id: entry.personalTimeId,
        title: entry.title ?? "Blocked time",
        start: entry.startDateTime ?? "",
        end: entry.endDateTime ?? "",
        venue: entry.location ?? "",
        kind: "blocked" as const,
      })),
    ].sort((left, right) => left.start.localeCompare(right.start));
    return { state: "ready", entries };
  } catch {
    return { state: "signed-out" };
  }
}
