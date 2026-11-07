"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
            ? "Saved to your Favorites! (Sign in on /login to sync to AWS Builder ID)"
            : "Removed from Favorites.",
        );
        return;
      }
      if (local.added && data.saved) {
        toast.success("Favorited and verified via GetSchedule on AWS Events API!");
      } else if (!local.added && data.removed) {
        toast.success("Removed from AWS Events schedule and local Favorites.");
      } else {
        toast.info(
          local.added
            ? `Saved locally (${describeReason(data.reason ?? data.error ?? "")})`
            : "Updated locally.",
        );
      }
    } catch {
      toast.success(local.added ? "Saved to Favorites." : "Removed from Favorites.");
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
        toast.error("Sign in with AWS Builder ID first to reserve seats.", {
          action: {
            label: "Sign In",
            onClick: () => {
              onOpenChange(false);
              router.push("/login");
            },
          },
        });
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
        ? `+50 XP! Rated ${stars}/5 ★ — linked architecture gaps marked addressed!`
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
    toast.success("Session takeaway note saved!");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-2xl overflow-y-auto rounded-t-3xl border-t-2 border-border bg-background p-0 text-foreground"
      >
        <div
          className={`flex items-center gap-2 px-5 py-3 text-xs font-extrabold ${
            reservable
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-secondary-foreground"
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
              <Badge variant="secondary" className="font-bold">
                {String(session.type || "Breakout")}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs font-bold">
                Level {level}
              </Badge>
              {session.code ? (
                <Badge className="bg-accent text-accent-foreground font-mono text-xs font-bold">
                  {session.code}
                </Badge>
              ) : null}
            </div>
            <SheetTitle className="font-heading text-xl font-black leading-snug text-foreground">
              {session.title}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3.5" />
                {String(session.start ?? "").slice(0, 10) || "Nov 30"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {formatClock(session.start)} ({durationMins(session.start, session.end)})
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {[session.venue, session.room].filter(Boolean).join(" • ")}
              </span>
            </SheetDescription>
          </SheetHeader>

          {speakers.length > 0 ? (
            <div className="card-tactile p-3 text-xs">
              <span className="font-extrabold">Speakers: </span>
              <span className="text-muted-foreground">{speakers.join("  •  ")}</span>
            </div>
          ) : null}

          {services.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {services.map((svc) => (
                <Badge key={svc} variant="outline" className="text-xs font-bold">
                  {svc}
                </Badge>
              ))}
            </div>
          ) : null}

          <p className="text-sm leading-relaxed text-muted-foreground">
            {session.abstract ||
              "Explore deep architectural patterns, production lessons learned, and implementation guidance with AWS engineers and community builders at re:Invent 2026."}
          </p>

          <div className="flex gap-3 pt-1">
            {reservable ? (
              <Button
                size="lg"
                onClick={() => void handleReserve()}
                disabled={reserving}
                className="flex-1"
              >
                <TicketCheck className="size-4" />
                {reserving ? "Checking seat…" : "Reserve Seat"}
              </Button>
            ) : null}
            <Button
              size="lg"
              variant={isFav ? "secondary" : "outline"}
              onClick={() => void handleFavorite()}
              disabled={savingFav}
              className="flex-1"
            >
              <Heart className={`size-4 ${isFav ? "fill-destructive text-destructive" : ""}`} />
              {isFav ? "Favorited" : "Favorite"}
            </Button>
          </div>

          <div className="card-tactile space-y-2.5 p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                <Sparkles className="size-4 text-primary" />
                Session Quest & Gap Reflection (+50 XP)
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRate(star)}
                    aria-label={`Rate ${star} stars`}
                    className="p-0.5 transition-transform hover:scale-125"
                  >
                    <Star
                      className={`size-5 ${
                        star <= rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40"
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
                className="text-xs"
              />
              <Button size="sm" variant="secondary" onClick={handleSaveNote}>
                Save Note
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
