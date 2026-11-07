"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, PartyPopper, Plus, Sparkles, Trash2 } from "lucide-react";
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

    // Merge local favorites
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

    // Merge local personal blocks
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

    // Also include prescribed sessions from the last repo scan if user has no API reservations yet
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
            kind: item.action === "reserve" ? "reserved" : item.action === "personal-time" ? "blocked" : "saved",
          });
        }
      }
    }

    // Optionally overlay evening parties
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
  }, [apiEntries, localFavIds, catalogMap, localBlocks, selectedDate, hideFavorites, showParties, parties]);

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
    <div className="relative min-h-dvh bg-[#0b0d13] pb-16">
      {/* Top Centered Header (Screenshot 1) */}
      <header className="sticky top-0 z-20 bg-[#0b0d13]/95 py-3.5 text-center backdrop-blur-md">
        <h1 className="text-base font-bold text-white">Your Calendar</h1>
      </header>

      {/* Month + Lavender "✦ Plan my day" Pill Row */}
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-base font-bold text-white">{activeDayMeta.month}</span>
        <button
          type="button"
          onClick={() => openMcp(`Plan my day for ${activeDayMeta.dow} ${activeDayMeta.date} with walkable sessions and evening parties`)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#9b8afb] px-4 py-2 text-xs font-semibold text-[#101218] shadow transition-transform active:scale-95"
        >
          <Sparkles className="size-3.5" />
          <span>Plan my day</span>
        </button>
      </div>

      {/* 5 Day Selector Pills (Mon 30, Tue 1, Wed 2, Thu 3, Fri 4) */}
      <div className="mt-4 grid grid-cols-5 gap-2.5 px-4">
        {CONFERENCE_DAYS.map((d) => {
          const active = d.date === selectedDate;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`flex h-16 flex-col items-center justify-center rounded-2xl border text-xs font-semibold transition-all ${
                active
                  ? "border-[#0095ff] bg-[#0095ff] text-white shadow-md shadow-[#0095ff]/25"
                  : "border-white/10 bg-[#181c26] text-slate-300 hover:border-white/25 hover:text-white"
              }`}
            >
              <span>{d.dow}</span>
              <span className="mt-0.5 text-sm font-bold">{d.num}</span>
            </button>
          );
        })}
      </div>

      {/* My Reservations + Hide Favorites (> circle button) */}
      <div className="mt-5 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">My Reservations</h2>
          <button
            type="button"
            onClick={() => setShowParties((p) => !p)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] transition-colors ${
              showParties
                ? "bg-[#9b8afb] font-bold text-[#101218]"
                : "border border-white/10 bg-[#181c26] text-slate-300"
            }`}
          >
            <PartyPopper className="size-3" />
            {showParties ? "Parties On" : "+ Parties"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setHideFavorites((prev) => !prev)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-white"
        >
          <span>{hideFavorites ? "Show Favorites" : "Hide Favorites"}</span>
          <span className="flex size-7 items-center justify-center rounded-full bg-[#1e232e]">
            <ChevronRight
              className={`size-4 transition-transform ${hideFavorites ? "rotate-90" : ""}`}
            />
          </span>
        </button>
      </div>

      {/* Hourly Timeline Grid (05:30 through 21:00) matching Screenshot 1 */}
      <div className="mt-4 space-y-0 px-3">
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
            <div key={`${slot.hour}:${slot.min}`} className="relative flex min-h-[58px] items-start gap-2">
              <div className="w-11 shrink-0 pt-0.5 font-mono text-[11px] leading-tight text-slate-300">
                <div>{slot.label}</div>
                {slot.ampm ? <div className="text-[10px] text-slate-400">{slot.ampm}</div> : null}
              </div>

              <div className="relative flex-1 pt-2.5">
                <div
                  className={
                    isHalfHour
                      ? "border-t border-dashed border-slate-800/90"
                      : "border-t border-slate-800"
                  }
                />

                {slotItems.length > 0 ? (
                  <div className="mt-2 space-y-2 pb-2">
                    {slotItems.map((entry) => {
                      const fullSession = catalogMap.get(entry.id);
                      return (
                        <div
                          key={`${entry.kind}-${entry.id}-${entry.start}`}
                          onClick={() => {
                            if (fullSession) openSession(fullSession);
                          }}
                          className={`flex items-start justify-between gap-2 rounded-xl border p-3 text-xs transition-colors ${
                            entry.kind === "reserved"
                              ? "border-[#0095ff]/50 bg-[#0d2542] text-white"
                              : entry.kind === "blocked"
                                ? "border-[#9b8afb]/40 bg-[#1e1a36] text-white"
                                : "border-white/10 bg-[#1c212d] text-white"
                          } ${fullSession ? "cursor-pointer hover:border-[#9b8afb]" : ""}`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300">
                              <span>
                                {String(entry.start).slice(11, 16)} – {String(entry.end).slice(11, 16)}
                              </span>
                              <span className="rounded bg-black/30 px-1.5 py-0.2 uppercase">
                                {entry.kind}
                              </span>
                            </div>
                            <p className="font-bold leading-snug text-white">{entry.title}</p>
                            {entry.venue ? (
                              <p className="text-[11px] text-slate-300">{entry.venue}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            aria-label="Remove from calendar"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemoveEntry(entry);
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-black/30 hover:text-rose-400"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
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

      {/* Floating White '+' Button above bottom bar (Screenshot 1) */}
      <div className="fixed inset-x-0 bottom-24 z-20 mx-auto flex max-w-[480px] justify-end px-5 pointer-events-none">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label="Add personal time block"
          className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-white text-slate-950 shadow-xl transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="size-6" strokeWidth={2.2} />
        </button>
      </div>

      {/* Create Personal Time Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-[480px] rounded-t-3xl border-t border-white/10 bg-[#141821] p-5 text-white"
        >
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-base font-bold text-white">
              Add Personal Time ({activeDayMeta.dow}, {activeDayMeta.month} {activeDayMeta.num})
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-400">
              Blocks time via CreatePersonalTime on the AWS Events API & your local calendar.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={(e) => void handleCreateBlock(e)} className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pt-title" className="text-xs text-slate-300">
                Title
              </Label>
              <Input
                id="pt-title"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                placeholder="e.g., Walk Venetian → Wynn, Team Dinner, Party"
                className="border-white/15 bg-[#0e121a] text-white"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pt-venue" className="text-xs text-slate-300">
                Venue / Location
              </Label>
              <Input
                id="pt-venue"
                value={blockVenue}
                onChange={(e) => setBlockVenue(e.target.value)}
                placeholder="The Venetian"
                className="border-white/15 bg-[#0e121a] text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pt-start" className="text-xs text-slate-300">
                  Start Time
                </Label>
                <Input
                  id="pt-start"
                  type="time"
                  step={300}
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  className="border-white/15 bg-[#0e121a] font-mono text-white"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pt-end" className="text-xs text-slate-300">
                  End Time
                </Label>
                <Input
                  id="pt-end"
                  type="time"
                  step={300}
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  className="border-white/15 bg-[#0e121a] font-mono text-white"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={savingBlock}
              className="mt-2 h-11 w-full rounded-full bg-[#0095ff] font-semibold text-white hover:bg-[#0095ff]/90"
            >
              {savingBlock ? "Saving block…" : "Save to Calendar"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
