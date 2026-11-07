"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, PartyPopper, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppShell } from "@/components/app-shell";
import {
  addLocalBlock,
  getLastScan,
  getLocalBlocks,
  getLocalFavorites,
  removeLocalBlock,
  removeLocalFavorite,
} from "@/lib/app-store";
import type { CalendarEntry, Party, ReinventSession } from "@/lib/types";

const CONFERENCE_DAYS = [
  { date: "2026-11-30", dow: "Mon", num: "30", month: "November" },
  { date: "2026-12-01", dow: "Tue", num: "1", month: "December" },
  { date: "2026-12-02", dow: "Wed", num: "2", month: "December" },
  { date: "2026-12-03", dow: "Thu", num: "3", month: "December" },
  { date: "2026-12-04", dow: "Fri", num: "4", month: "December" },
] as const;

const TIME_SLOTS = [
  { hour: 5, min: 30, label: "05:30", ampm: "" },
  { hour: 6, min: 0, label: "06:00", ampm: "AM" },
  { hour: 6, min: 30, label: "06:30", ampm: "" },
  { hour: 7, min: 0, label: "07:00", ampm: "AM" },
  { hour: 7, min: 30, label: "07:30", ampm: "" },
  { hour: 8, min: 0, label: "08:00", ampm: "AM" },
  { hour: 8, min: 30, label: "08:30", ampm: "" },
  { hour: 9, min: 0, label: "09:00", ampm: "AM" },
  { hour: 9, min: 30, label: "09:30", ampm: "" },
  { hour: 10, min: 0, label: "10:00", ampm: "AM" },
  { hour: 10, min: 30, label: "10:30", ampm: "" },
  { hour: 11, min: 0, label: "11:00", ampm: "AM" },
  { hour: 11, min: 30, label: "11:30", ampm: "" },
  { hour: 12, min: 0, label: "12:00", ampm: "PM" },
  { hour: 12, min: 30, label: "12:30", ampm: "" },
  { hour: 13, min: 0, label: "01:00", ampm: "PM" },
  { hour: 13, min: 30, label: "01:30", ampm: "" },
  { hour: 14, min: 0, label: "02:00", ampm: "PM" },
  { hour: 14, min: 30, label: "02:30", ampm: "" },
  { hour: 15, min: 0, label: "03:00", ampm: "PM" },
  { hour: 15, min: 30, label: "03:30", ampm: "" },
  { hour: 16, min: 0, label: "04:00", ampm: "PM" },
  { hour: 16, min: 30, label: "04:30", ampm: "" },
  { hour: 17, min: 0, label: "05:00", ampm: "PM" },
  { hour: 17, min: 30, label: "05:30", ampm: "" },
  { hour: 18, min: 0, label: "06:00", ampm: "PM" },
  { hour: 18, min: 30, label: "06:30", ampm: "" },
  { hour: 19, min: 0, label: "07:00", ampm: "PM" },
  { hour: 19, min: 30, label: "07:30", ampm: "" },
  { hour: 20, min: 0, label: "08:00", ampm: "PM" },
  { hour: 20, min: 30, label: "08:30", ampm: "" },
  { hour: 21, min: 0, label: "09:00", ampm: "PM" },
] as const;

export default function CalendarPage() {
  const { openMcp, openSession } = useAppShell();
  const [selectedDate, setSelectedDate] = useState<string>("2026-11-30");
  const [hideFavorites, setHideFavorites] = useState(false);
  const [showParties, setShowParties] = useState(false);

  const [apiEntries, setApiEntries] = useState<CalendarEntry[]>([]);
  const [catalogMap, setCatalogMap] = useState<Map<string, ReinventSession>>(new Map());
  const [localFavIds, setLocalFavIds] = useState<string[]>([]);
  const [localBlocks, setLocalBlocks] = useState(getLocalBlocks());
  const [parties, setParties] = useState<Party[]>([]);

  // Add Personal Time Sheet
  const [addOpen, setAddOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockVenue, setBlockVenue] = useState("The Venetian");
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("10:00");
  const [savingBlock, setSavingBlock] = useState(false);

  async function loadAll() {
    setLocalFavIds(getLocalFavorites());
    setLocalBlocks(getLocalBlocks());

    try {
      const catRes = await fetch("/api/catalog");
      if (catRes.ok) {
        const catData = (await catRes.json()) as { sessions?: ReinventSession[] };
        const map = new Map<string, ReinventSession>();
        for (const s of catData.sessions ?? []) {
          map.set(s.sessionId, s);
        }
        setCatalogMap(map);
      }
    } catch {
      // ignore
    }

    try {
      const schedRes = await fetch("/api/schedule");
      if (schedRes.ok) {
        const data = (await schedRes.json()) as {
          favorites?: Array<{
            sessionId: string;
            title?: string;
            start?: string;
            end?: string;
            venue?: string;
            room?: string;
          }>;
          reservations?: Array<{
            sessionId: string;
            title?: string;
            start?: string;
            end?: string;
            venue?: string;
            room?: string;
          }>;
          personalTime?: Array<{
            personalTimeId: string;
            title?: string;
            startDateTime?: string;
            endDateTime?: string;
            location?: string;
          }>;
        };
        const list: CalendarEntry[] = [
          ...(data.reservations ?? []).map((r) => ({
            id: r.sessionId,
            title: r.title ?? r.sessionId,
            start: r.start ?? "2026-11-30T09:00:00",
            end: r.end ?? "2026-11-30T10:00:00",
            venue: [r.venue, r.room].filter(Boolean).join(" • "),
            kind: "reserved" as const,
          })),
          ...(data.favorites ?? []).map((f) => ({
            id: f.sessionId,
            title: f.title ?? f.sessionId,
            start: f.start ?? "2026-11-30T10:30:00",
            end: f.end ?? "2026-11-30T11:30:00",
            venue: [f.venue, f.room].filter(Boolean).join(" • "),
            kind: "saved" as const,
          })),
          ...(data.personalTime ?? []).map((pt) => ({
            id: pt.personalTimeId,
            title: pt.title ?? "Personal Time",
            start: pt.startDateTime ?? "2026-11-30T12:00:00",
            end: pt.endDateTime ?? "2026-11-30T13:00:00",
            venue: pt.location ?? "Personal",
            kind: "blocked" as const,
          })),
        ];
        setApiEntries(list);
      }
    } catch {
      // signed out or offline
    }

    try {
      const pRes = await fetch("/api/parties");
      if (pRes.ok) {
        const pData = (await pRes.json()) as { parties?: Party[] };
        setParties(pData.parties ?? []);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadAll();
    const onSync = () => void loadAll();
    window.addEventListener("repo-invent:schedule-updated", onSync);
    window.addEventListener("repo-invent:scan-updated", onSync);
    return () => {
      window.removeEventListener("repo-invent:schedule-updated", onSync);
      window.removeEventListener("repo-invent:scan-updated", onSync);
    };
  }, []);

  const dayEntries = useMemo(() => {
    const combined = new Map<string, CalendarEntry>();

    for (const item of apiEntries) {
      combined.set(`${item.kind}-${item.id}`, item);
    }

    for (const favId of localFavIds) {
      const s = catalogMap.get(favId);
      if (s && !combined.has(`saved-${favId}`)) {
        combined.set(`saved-${favId}`, {
          id: favId,
          title: s.title,
          start: s.start,
          end: s.end,
          venue: [s.venue, s.room].filter(Boolean).join(" • "),
          kind: "saved",
        });
      }
    }

    for (const b of localBlocks) {
      combined.set(`blocked-${b.id}`, {
        id: b.id,
        title: b.title,
        start: b.start,
        end: b.end,
        venue: b.venue,
        kind: "blocked",
      });
    }

    const scan = typeof window !== "undefined" ? getLastScan() : null;
    const scanDay = scan?.schedule?.days?.find((d) => d.date === selectedDate);
    if (scanDay) {
      for (const item of scanDay.items) {
        const key = `scan-${item.sessionId}-${item.start}`;
        if (!combined.has(`saved-${item.sessionId}`) && !combined.has(`reserved-${item.sessionId}`)) {
          combined.set(key, {
            id: item.sessionId,
            title: `${item.title} (Repo Plan)`,
            start: item.start,
            end: item.end,
            venue: item.venue,
            kind:
              item.action === "reserve"
                ? "reserved"
                : item.action === "personal-time"
                  ? "blocked"
                  : "saved",
          });
        }
      }
    }

    if (showParties) {
      for (const p of parties.filter((pt) => pt.date === selectedDate)) {
        const startIso = p.start ?? `${selectedDate}T19:00:00`;
        combined.set(`party-${p.title}-${startIso}`, {
          id: `party-${p.title}`,
          title: `🎉 ${p.title} (${p.sponsors.join(", ")})`,
          start: startIso,
          end: p.end ?? `${selectedDate}T21:00:00`,
          venue: p.venue || p.location,
          kind: "blocked",
        });
      }
    }

    return [...combined.values()].filter((entry) => {
      if (hideFavorites && entry.kind === "saved") return false;
      return String(entry.start).slice(0, 10) === selectedDate;
    });
  }, [
    apiEntries,
    localFavIds,
    catalogMap,
    localBlocks,
    selectedDate,
    hideFavorites,
    showParties,
    parties,
  ]);

  const activeDayMeta =
    CONFERENCE_DAYS.find((d) => d.date === selectedDate) ?? CONFERENCE_DAYS[0];

  async function handleRemoveEntry(entry: CalendarEntry) {
    if (entry.id.startsWith("local-pt-")) {
      removeLocalBlock(entry.id);
      setLocalBlocks(getLocalBlocks());
      toast.success("Removed personal time block.");
      return;
    }
    removeLocalFavorite(entry.id);
    setLocalFavIds(getLocalFavorites());
    try {
      await fetch(entry.kind === "blocked" ? "/api/personal-time" : "/api/unfavorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          entry.kind === "blocked" ? { personalId: entry.id } : { sessionId: entry.id },
        ),
      });
      toast.success("Removed from schedule.");
      void loadAll();
    } catch {
      toast.success("Removed locally.");
    }
  }

  async function handleCreateBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blockTitle.trim()) {
      toast.error("Give the time block a title.");
      return;
    }
    setSavingBlock(true);
    const startIso = `${selectedDate}T${blockStart}`;
    const endIso = `${selectedDate}T${blockEnd}`;

    addLocalBlock({
      title: blockTitle.trim(),
      start: `${startIso}:00`,
      end: `${endIso}:00`,
      venue: blockVenue,
    });
    setLocalBlocks(getLocalBlocks());

    try {
      const response = await fetch("/api/personal-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: blockTitle.trim(),
          start: startIso,
          end: endIso,
          location: blockVenue,
        }),
      });
      if (response.ok) {
        toast.success("Personal time saved to AWS Events schedule!");
        void loadAll();
      } else {
        toast.success("Personal time added to your calendar.");
      }
    } catch {
      toast.success("Personal time added to your calendar.");
    } finally {
      setSavingBlock(false);
      setBlockTitle("");
      setAddOpen(false);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-black tracking-tight">Your Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {activeDayMeta.month} 2026 • Manage reservations, favorites, personal blocks & party
            overlays
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              openMcp(
                `Plan my day for ${activeDayMeta.dow} ${activeDayMeta.date} with walkable sessions and evening parties`,
              )
            }
          >
            <Sparkles className="size-4" />
            <span>Plan my day</span>
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            <span>Add Time Block</span>
          </Button>
        </div>
      </div>

      {/* 5 Day Selector Tactile Pills (Mon 30, Tue 1, Wed 2, Thu 3, Fri 4) */}
      <div className="grid grid-cols-5 gap-3">
        {CONFERENCE_DAYS.map((d) => {
          const active = d.date === selectedDate;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`flex h-16 flex-col items-center justify-center rounded-2xl border-2 text-xs font-extrabold transition-all cursor-pointer ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-tactile-primary"
                  : "border-border bg-card text-foreground shadow-tactile hover:bg-muted/50"
              }`}
            >
              <span>{d.dow}</span>
              <span className="font-heading mt-0.5 text-base font-black">{d.num}</span>
            </button>
          );
        })}
      </div>

      {/* My Reservations + Hide Favorites + Parties Overlay Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border pb-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-heading text-lg font-black">My Reservations & Schedule</h2>
          <Button
            size="xs"
            variant={showParties ? "default" : "outline"}
            onClick={() => setShowParties((p) => !p)}
          >
            <PartyPopper className="size-3.5" />
            {showParties ? "Parties On" : "+ Overlay Parties"}
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setHideFavorites((prev) => !prev)}
        >
          <span>{hideFavorites ? "Show Favorites" : "Hide Favorites"}</span>
          <ChevronRight
            className={`size-4 transition-transform ${hideFavorites ? "rotate-90" : ""}`}
          />
        </Button>
      </div>

      {/* Hourly Timeline Grid (05:30 through 21:00) */}
      <div className="card-tactile divide-y divide-border/60 p-4">
        {TIME_SLOTS.map((slot) => {
          const isHalfHour = slot.min === 30;
          const slotItems = dayEntries.filter((entry) => {
            const m = /T(\d{2}):(\d{2})/.exec(String(entry.start));
            if (!m) return slot.hour === 9 && slot.min === 0;
            const h = Number(m[1]);
            const min = Number(m[2]) >= 30 ? 30 : 0;
            return h === slot.hour && min === slot.min;
          });

          return (
            <div
              key={`${slot.hour}:${slot.min}`}
              className="flex min-h-[54px] items-start gap-4 py-2"
            >
              <div className="w-14 shrink-0 font-mono text-xs font-bold text-muted-foreground">
                <span>{slot.label}</span>
                {slot.ampm ? <span className="ml-1 text-[10px]">{slot.ampm}</span> : null}
              </div>

              <div
                className={`flex-1 ${
                  isHalfHour && slotItems.length === 0 ? "opacity-60" : ""
                }`}
              >
                {slotItems.length > 0 ? (
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {slotItems.map((entry) => {
                      const fullSession = catalogMap.get(entry.id);
                      return (
                        <div
                          key={`${entry.kind}-${entry.id}-${entry.start}`}
                          onClick={() => {
                            if (fullSession) openSession(fullSession);
                          }}
                          className={`card-tactile flex items-start justify-between gap-2 p-3 text-xs ${
                            entry.kind === "reserved"
                              ? "border-primary bg-primary/10"
                              : entry.kind === "blocked"
                                ? "border-accent bg-accent/20"
                                : "bg-muted/40"
                          } ${fullSession ? "cursor-pointer hover:border-primary" : ""}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-muted-foreground">
                              <span>
                                {String(entry.start).slice(11, 16)} –{" "}
                                {String(entry.end).slice(11, 16)}
                              </span>
                              <Badge variant="outline" className="px-1.5 py-0 text-[9px] uppercase">
                                {entry.kind}
                              </Badge>
                            </div>
                            <p className="font-heading text-sm font-extrabold">{entry.title}</p>
                            {entry.venue ? (
                              <p className="text-[11px] text-muted-foreground">{entry.venue}</p>
                            ) : null}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Remove from calendar"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemoveEntry(entry);
                            }}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Personal Time Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg rounded-t-3xl border-t-2 border-border bg-background p-5 text-foreground"
        >
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="font-heading text-lg font-black">
              Add Personal Time ({activeDayMeta.dow}, {activeDayMeta.month} {activeDayMeta.num})
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Blocks time via CreatePersonalTime on the AWS Events API & your local calendar.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={(e) => void handleCreateBlock(e)} className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pt-title" className="text-xs font-bold">
                Title
              </Label>
              <Input
                id="pt-title"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                placeholder="e.g., Walk Venetian → Wynn, Team Dinner, Party"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pt-venue" className="text-xs font-bold">
                Venue / Location
              </Label>
              <Input
                id="pt-venue"
                value={blockVenue}
                onChange={(e) => setBlockVenue(e.target.value)}
                placeholder="The Venetian"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pt-start" className="text-xs font-bold">
                  Start Time
                </Label>
                <Input
                  id="pt-start"
                  type="time"
                  step={300}
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pt-end" className="text-xs font-bold">
                  End Time
                </Label>
                <Input
                  id="pt-end"
                  type="time"
                  step={300}
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  className="font-mono"
                  required
                />
              </div>
            </div>

            <Button type="submit" size="lg" disabled={savingBlock} className="mt-2 w-full">
              {savingBlock ? "Saving block…" : "Save to Calendar"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
