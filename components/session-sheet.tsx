"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock, Heart, Info, MapPin, Sparkles, Star, TicketCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getLocalFavorites,
  getLocalReflections,
  saveLocalReflection,
  toggleLocalFavorite,
} from "@/lib/app-store";
import type { ReinventSession } from "@/lib/types";

export function SessionSheet({
  session,
  open,
  onOpenChange,
}: {
  session: ReinventSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [savingFav, setSavingFav] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!session) return;
    setIsFav(getLocalFavorites().includes(session.sessionId));
    const existing = getLocalReflections().find((r) => r.sessionId === session.sessionId);
    setRating(existing?.rating ?? 0);
    setNote(existing?.note ?? "");
  }, [session]);

  if (session === null) return null;

  const reservable = session.availability?.reservable !== false;
  const level = typeof session.level === "number" ? `${session.level}` : String(session.level || "200");
  const speakers = Array.isArray(session.speakers) ? session.speakers : [];
  const services = Array.isArray(session.services) ? session.services : [];

  async function handleFavorite() {
    if (!session) return;
    setSavingFav(true);
    const local = toggleLocalFavorite(session.sessionId);
    setIsFav(local.added);
    try {
      const response = await fetch(local.added ? "/api/favorite" : "/api/unfavorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = (await response.json()) as {
        saved?: boolean;
        removed?: boolean;
        reason?: string;
        error?: string;
      };
      if (response.status === 401) {
        toast.success(
          local.added
            ? "Added to your local Favorites (sign in via CLI to sync to AWS Builder ID)."
            : "Removed from local Favorites.",
        );
        return;
      }
      if (local.added && data.saved) {
        toast.success("Favorited and verified via GetSchedule on AWS Events API.");
      } else if (!local.added && data.removed) {
        toast.success("Removed from AWS Events schedule and local Favorites.");
      } else {
        toast.info(
          local.added
            ? `Saved locally (AWS API note: ${describeReason(data.reason ?? data.error ?? "")})`
            : "Updated locally.",
        );
      }
    } catch {
      toast.success(local.added ? "Saved to local Favorites." : "Removed from local Favorites.");
    } finally {
      setSavingFav(false);
    }
  }

  async function handleReserve() {
    if (!session) return;
    setReserving(true);
    try {
      const response = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = (await response.json()) as {
        reserved?: boolean;
        reason?: string;
        error?: string;
      };
      if (response.status === 401) {
        toast.error("Run `pnpm cli login` in a terminal to reserve seats with AWS Builder ID.");
        return;
      }
      if (data.reserved) {
        toast.success("Seat reserved and verified via GetSchedule!");
      } else {
        toast.warning(`Reserve status: ${describeReason(data.reason ?? data.error ?? "sessionFull")}`);
      }
    } catch {
      toast.error("Could not reach the reservation endpoint.");
    } finally {
      setReserving(false);
    }
  }

  function handleRate(stars: number) {
    if (!session) return;
    setRating(stars);
    saveLocalReflection({
      sessionId: session.sessionId,
      title: session.title,
      rating: stars,
      note,
      updatedAt: new Date().toISOString(),
    });
    toast.success(
      stars >= 3
        ? `Rated ${stars}/5 ★ — linked architecture gaps marked addressed!`
        : `Saved ${stars}/5 ★ reflection.`,
    );
  }

  function handleSaveNote() {
    if (!session) return;
    saveLocalReflection({
      sessionId: session.sessionId,
      title: session.title,
      rating: rating || 4,
      note,
      updatedAt: new Date().toISOString(),
    });
    if (!rating) setRating(4);
    toast.success("Session takeaway note saved.");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-[520px] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#141821] p-0 text-white"
      >
        <div
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-medium ${
            reservable ? "bg-[#093b2c] text-emerald-300" : "bg-[#003687] text-blue-200"
          }`}
        >
          <Info className="size-4 shrink-0" />
          <span>
            {reservable
              ? "Reservable seat (10-minute seat forfeiture rule applies)"
              : "Walk-up only — arrive 15 minutes early to join the walk-up line"}
          </span>
        </div>

        <div className="space-y-4 p-5">
          <SheetHeader className="space-y-2 p-0 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[#252b38] text-xs font-medium text-slate-200">
                {String(session.type || "Breakout")}
              </Badge>
              <Badge variant="outline" className="border-white/15 font-mono text-xs text-slate-300">
                Level {level}
              </Badge>
              {session.code ? (
                <Badge variant="outline" className="border-[#9b8afb]/40 font-mono text-xs text-[#9b8afb]">
                  {session.code}
                </Badge>
              ) : null}
            </div>
            <SheetTitle className="text-lg font-bold leading-snug text-white">
              {session.title}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3.5 text-slate-400" />
                {String(session.start ?? "").slice(0, 10) || "Nov 30"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5 text-slate-400" />
                {formatClock(session.start)} ({durationMins(session.start, session.end)})
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5 text-slate-400" />
                {[session.venue, session.room].filter(Boolean).join(" • ")}
              </span>
            </SheetDescription>
          </SheetHeader>

          {speakers.length > 0 ? (
            <div className="rounded-xl bg-[#1c212d] p-3 text-xs">
              <span className="font-semibold text-white">Speakers </span>
              <span className="text-slate-300">{speakers.join("  •  ")}</span>
            </div>
          ) : null}

          {services.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {services.map((svc) => (
                <span
                  key={svc}
                  className="rounded-full border border-white/10 bg-[#1a1f2a] px-2.5 py-0.5 text-[11px] text-slate-300"
                >
                  {svc}
                </span>
              ))}
            </div>
          ) : null}

          <p className="text-sm leading-relaxed text-slate-300">
            {session.abstract ||
              "Explore deep architectural patterns, production lessons learned, and implementation guidance with AWS engineers and community builders at re:Invent 2026."}
          </p>

          <div className="flex gap-2.5 pt-1">
            {reservable ? (
              <Button
                onClick={() => void handleReserve()}
                disabled={reserving}
                className="h-11 flex-1 rounded-full bg-[#0095ff] font-semibold text-white hover:bg-[#0095ff]/90"
              >
                <TicketCheck className="mr-1.5 size-4" />
                {reserving ? "Checking seat…" : "Reserve seat"}
              </Button>
            ) : null}
            <Button
              onClick={() => void handleFavorite()}
              disabled={savingFav}
              variant={isFav ? "default" : "secondary"}
              className={`h-11 flex-1 rounded-full font-semibold ${
                isFav
                  ? "bg-white text-slate-950 hover:bg-slate-200"
                  : "bg-[#222836] text-white hover:bg-[#2b3242]"
              }`}
            >
              <Heart className={`mr-1.5 size-4 ${isFav ? "fill-rose-500 text-rose-500" : ""}`} />
              {isFav ? "Favorited" : "Favorite"}
            </Button>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-white/10 bg-[#1a1f2b] p-3.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <Sparkles className="size-3.5 text-[#9b8afb]" />
                Session survey & gap reflection
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRate(star)}
                    aria-label={`Rate ${star} stars`}
                    className="p-0.5 text-amber-400 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`size-4 ${
                        star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-600"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Key takeaway for your team's architecture…"
                className="h-9 border-white/10 bg-[#11151d] text-xs text-white"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSaveNote}
                className="h-9 bg-[#2a3142] text-xs text-white"
              >
                Save note
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function describeReason(reason: string): string {
  if (reason === "sessionFull") return "Session is currently full (added to walk-up / favorites)";
  if (reason === "insufficientAccess") return "Attendee pass required for seat reservation";
  if (reason === "alreadyFavorited") return "Already in your AWS Events favorites";
  if (!reason) return "Seat full — use walk-up queue";
  return reason;
}

function formatClock(iso: string | undefined): string {
  const s = String(iso ?? "");
  const m = /T(\d{2}):(\d{2})/.exec(s);
  if (!m) return "10:00 AM";
  const h = Number(m[1]);
  const min = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${min} ${suffix}`;
}

function durationMins(start: string | undefined, end: string | undefined): string {
  const a = Date.parse(String(start ?? ""));
  const b = Date.parse(String(end ?? ""));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "60 min";
  const mins = Math.round((b - a) / 60000);
  if (mins >= 360) return "All Day";
  return `${mins} min`;
}
