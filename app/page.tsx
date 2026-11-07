"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUp,
  Calendar,
  ChevronLeft,
  Clock,
  ExternalLink,
  GitBranch,
  Heart,
  Info,
  Maximize2,
  Menu,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppShell } from "@/components/app-shell";
import {
  addLocalFavorite,
  getLastScan,
  getLocalFavorites,
  saveLastScan,
} from "@/lib/app-store";
import type { PlanDay, ReinventSession, ScanResult, Ticket } from "@/lib/types";

const SAMPLE_REPO = "sample://reinvent-demo-shop";

const STORIES = [
  {
    id: "reserve",
    title: "Reserve your seat now",
    gradient: "from-[#a81c83] via-[#6b1fd1] to-[#230b5c]",
    activeRing: true,
    detailTitle: "Reserved Seating & Walk-Up Rules",
    detailBody:
      "Reserved seating is live via ReserveSessions on the AWS Events API. Remember the 10-minute seat forfeiture rule: reserved seats are released to the walk-up line 10 minutes before start time.",
    ctaLabel: "Browse Open Seats in Catalog",
    ctaHref: "/catalog?filter=open",
  },
  {
    id: "know",
    title: "Know before you go",
    gradient: "from-[#0095ff] via-[#2b3595] to-[#121629]",
    activeRing: false,
    detailTitle: "Know Before You Go: Las Vegas Campus",
    detailBody:
      "Pick up your badge at Harry Reid Airport (LAS) or The Venetian, Caesars Forum, Wynn, or MGM Grand. Wear comfortable shoes—walking Venetian to Wynn takes 18 minutes.",
    ctaLabel: "Open Badge Pickup QR Code",
    ctaAction: "badge" as const,
  },
  {
    id: "week",
    title: "Your week, your way",
    gradient: "from-[#8c27b0] via-[#4a1882] to-[#121024]",
    activeRing: false,
    detailTitle: "Your Week, Your Way: Repo-Driven Planning",
    detailBody:
      "Scan your GitHub repository to automatically diagnose AWS architecture gaps, prescribe a walkable 5-day schedule, and export remediation tickets with acceptance tests.",
    ctaLabel: "Scan Sample Repository",
    ctaAction: "scan" as const,
  },
  {
    id: "keynotes",
    title: "Keynotes at re:Invent",
    gradient: "from-[#0088ff] via-[#5d26c1] to-[#1a0f3b]",
    activeRing: false,
    detailTitle: "Featured Keynotes at re:Invent 2026",
    detailBody:
      "Don't miss the CEO Keynote, Developer Keynote (Eric Johnson & Marc Brooker), AI & Data Keynote, and Infrastructure Keynote.",
    ctaLabel: "Filter Keynotes in Catalog",
    ctaHref: "/catalog?q=Keynote",
  },
  {
    id: "parties",
    title: "171 Vegas Parties",
    gradient: "from-[#e84393] via-[#6c5ce7] to-[#19162b]",
    activeRing: false,
    detailTitle: "171 Unofficial Parties (conferenceparties.com)",
    detailBody:
      "Explore all 171 vendor and community parties across 6 nights (Sunday Nov 29 – Friday Dec 4) with direct RSVP links and Google Maps pins.",
    ctaLabel: "Explore All 171 Parties",
    ctaHref: "/parties",
  },
];

const CURATED_RECOMMENDATIONS: ReinventSession[] = [
  {
    sessionId: "1791492157127001UCdR",
    title: "Developer Keynote",
    abstract:
      "Building software has never moved faster, and it has never asked more of developers. In this keynote, AWS Engineers and Heroes from the community tackle what's still hard: going from idea to a live app in production.",
    code: "KEY001",
    type: "Keynote",
    level: 200,
    venue: "The Venetian",
    room: "Level 2 | Ballroom E | Keynote",
    start: "2026-11-30T19:30:00",
    end: "2026-11-30T20:45:00",
    availability: { reservable: false, fullness: "walk-up-up" },
    tracks: ["Keynote"],
    topics: ["Developer Tools", "Agentic AI"],
    services: ["Bedrock", "Kiro", "Lambda"],
    speakers: ["Eric Johnson", "Marc Brooker", " Emily Freeman"],
  },
  {
    sessionId: "SESS-AGENT-3001",
    title: "Building Production Agentic Workflows with Bedrock AgentCore",
    abstract:
      "Move from a demo agent to a governed one: runtime isolation, memory, identity, and observability for agents that serve real traffic across multi-step tool calls.",
    code: "AIM301",
    type: "Breakout",
    level: 300,
    venue: "The Venetian",
    room: "Level 3, Hall A",
    start: "2026-11-30T09:00:00",
    end: "2026-11-30T10:00:00",
    availability: { reservable: true, fullness: "open" },
    tracks: ["Artificial Intelligence"],
    topics: ["Agentic AI", "Bedrock"],
    services: ["Bedrock", "AgentCore"],
    speakers: ["Priya Raman", "David Yanacek"],
  },
  {
    sessionId: "1780442262603001cBYV",
    title: "Renaissance Dad: building an agentic learning app for my 9-year-old with Kiro",
    abstract:
      "See how spec-driven agentic development turns an idea into a production-ready full-stack application with automated verification and guardrails.",
    code: "COM342",
    type: "Lightning Talk",
    level: 300,
    venue: "The Venetian",
    room: "Level 2 | Hall B | Expo | Builder Theater",
    start: "2026-11-30T18:30:00",
    end: "2026-11-30T18:50:00",
    availability: { reservable: false, fullness: "walk-up-up" },
    tracks: ["Developer Tools"],
    topics: ["AI Agents", "Kiro"],
    services: ["Bedrock"],
    speakers: ["Community Hero"],
  },
];

export default function HomePage() {
  const router = useRouter();
  const { openMcp, openMore, openSession } = useAppShell();

  const [showSwitchBanner, setShowSwitchBanner] = useState(true);
  const [activeStory, setActiveStory] = useState<(typeof STORIES)[number] | null>(null);
  const [catalog, setCatalog] = useState<ReinventSession[]>([]);
  const [askText, setAskText] = useState("");

  // Repo Scanner state (right on top of the Ask AWS button!)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("https://github.com/aws-samples/aws-serverless-ecommerce-platform");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Swipeable Recommendations state
  const [recIndex, setRecIndex] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [favIds, setFavIds] = useState<string[]>([]);

  useEffect(() => {
    setFavIds(getLocalFavorites());
    const savedScan = getLastScan();
    if (savedScan) setScanResult(savedScan);

    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalog"))))
      .then((d: { sessions?: ReinventSession[] }) => {
        if (Array.isArray(d.sessions) && d.sessions.length > 0) {
          setCatalog(d.sessions);
        }
      })
      .catch(() => {
        // fallback to curated
      });
  }, []);

  const recommendations = useMemo(() => {
    const pool = [...CURATED_RECOMMENDATIONS];
    for (const s of catalog) {
      if (pool.length >= 20) break;
      if (!pool.some((p) => p.sessionId === s.sessionId)) {
        pool.push(s);
      }
    }
    return pool.filter((s) => !dismissedIds.includes(s.sessionId));
  }, [catalog, dismissedIds]);

  const currentRec = recommendations[recIndex % Math.max(1, recommendations.length)] ?? CURATED_RECOMMENDATIONS[0];

  const alertCount = useMemo(() => {
    if (catalog.length === 0) return 20;
    const walkups = catalog.filter((s) => s.availability?.reservable === false).length;
    return walkups > 0 ? Math.min(20, walkups) : 20;
  }, [catalog]);

  async function runRepoScan(targetUrl: string) {
    setScannerOpen(true);
    setScanning(true);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: targetUrl }),
      });
      const data = (await response.json()) as ScanResult & { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Repository scan failed.");
        return;
      }
      setScanResult(data);
      saveLastScan(data);
      toast.success(
        `Scanned ${data.fingerprint.repo.owner}/${data.fingerprint.repo.repo}: ${data.gaps.length} architecture gaps found!`,
      );
    } catch {
      toast.error("Could not reach the repository scanner.");
    } finally {
      setScanning(false);
    }
  }

  function handleDismissRec() {
    if (!currentRec) return;
    setDismissedIds((prev) => [...prev, currentRec.sessionId]);
  }

  async function handleHeartRec() {
    if (!currentRec) return;
    const nextFavs = addLocalFavorite(currentRec.sessionId);
    setFavIds(nextFavs);
    toast.success(`Saved "${currentRec.title}" to your Favorites!`);
    try {
      await fetch("/api/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentRec.sessionId }),
      });
    } catch {
      // local favorite already saved
    }
    setRecIndex((prev) => prev + 1);
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Top Official Header */}
      <header className="px-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronLeft className="size-6 text-slate-300" />
            <div className="leading-none">
              <div className="flex items-baseline gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  AWS
                </span>
                <span className="text-2xl font-light tracking-tight text-white">
                  <span className="font-normal text-slate-300">re:</span>Invent
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openMore("main")}
            aria-label="Open More menu"
            className="rounded-lg p-1.5 text-white hover:bg-white/10"
          >
            <Menu className="size-6" />
          </button>
        </div>
        <p className="mt-1 pl-8 text-xs text-slate-400">November 30 - December 4, 2026</p>
      </header>

      {/* Blue Switch Interface Banner */}
      {showSwitchBanner ? (
        <div className="flex items-center justify-between bg-[#003181] px-4 py-2.5 text-xs text-white">
          <div className="flex items-center gap-2">
            <Info className="size-4 shrink-0 text-[#5ab4ff]" />
            <span>Switch to a familiar app interface.</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/catalog")}
              className="font-semibold text-[#5ab4ff] hover:underline"
            >
              Switch
            </button>
            <button
              type="button"
              aria-label="Dismiss banner"
              onClick={() => setShowSwitchBanner(false)}
              className="text-slate-300 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Top Story Cards Carousel */}
      <section className="space-y-3">
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
          {STORIES.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setActiveStory(story)}
              className={`relative flex h-[138px] w-[122px] shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br ${story.gradient} p-3 text-left transition-transform hover:scale-[1.02] ${
                story.activeRing
                  ? "ring-2 ring-slate-300 ring-offset-2 ring-offset-[#0b0d13]"
                  : "border border-white/15"
              }`}
            >
              <span className="text-xs font-bold leading-snug text-white drop-shadow">
                {story.title}
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-center gap-1.5">
          <span className="size-2 rounded-full border border-white bg-white/80" />
          <span className="size-2 rounded-full border border-slate-600 bg-transparent" />
        </div>
      </section>

      {/* Story Modal if clicked */}
      {activeStory ? (
        <div className="mx-4 rounded-2xl border border-[#9b8afb]/40 bg-[#171c28] p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-white">{activeStory.detailTitle}</h3>
            <button
              type="button"
              onClick={() => setActiveStory(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{activeStory.detailBody}</p>
          <div className="mt-3">
            {activeStory.ctaHref ? (
              <Button
                size="sm"
                onClick={() => {
                  const href = activeStory.ctaHref!;
                  setActiveStory(null);
                  router.push(href);
                }}
                className="rounded-full bg-[#9b8afb] text-xs font-semibold text-[#101218]"
              >
                {activeStory.ctaLabel}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  const act = activeStory.ctaAction;
                  setActiveStory(null);
                  if (act === "badge") openMore("badge");
                  if (act === "scan") void runRepoScan(SAMPLE_REPO);
                }}
                className="rounded-full bg-[#9b8afb] text-xs font-semibold text-[#101218]"
              >
                {activeStory.ctaLabel}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Greeting */}
      <section className="px-4">
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-tight text-white">
          <span className="inline-flex items-center gap-1.5 text-[#9b8afb]">
            <Sparkles className="size-6" />
            Good afternoon,
          </span>{" "}
          I&apos;m here to help you get ready for re:Invent.
        </h1>
      </section>

      {/* Session Alerts Card */}
      <section className="px-4">
        <button
          type="button"
          onClick={() => router.push("/catalog?filter=open")}
          className="flex w-full flex-col items-start rounded-2xl bg-[#1e232e] p-5 text-left transition-colors hover:bg-[#252b38]"
        >
          <span className="rounded bg-[#e96d63] px-2.5 py-1 font-mono text-xs font-semibold text-[#1a0c0a]">
            Few seats left
          </span>
          <p className="mt-3 text-lg font-bold text-white">{alertCount} session alerts</p>
          <p className="mt-0.5 text-xs text-slate-300">Seats are filling up</p>
          <ArrowRight className="mt-4 size-5 text-slate-200" />
        </button>
      </section>

      {/* "What can I help you get done?" + Repo Scanner Button RIGHT ON TOP of Ask AWS */}
      <section className="space-y-3 px-4">
        <h2 className="text-lg font-bold text-white">What can I help you get done?</h2>

        {/* OUR REPO:INVENT BUTTON RIGHT ON TOP OF THE ASK AWS BUTTON */}
        <div className="rounded-2xl border border-[#9b8afb]/40 bg-gradient-to-r from-[#1c1836] via-[#171d2b] to-[#1a2234] p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setScannerOpen((prev) => !prev)}
              className="flex flex-1 items-center gap-2.5 text-left"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#9b8afb] text-[#101218]">
                <GitBranch className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">
                  Scan GitHub Repo for AWS Suggestions
                </p>
                <p className="text-[11px] text-slate-300">
                  Diagnose repo architecture gaps → prescribe sessions & tickets
                </p>
              </div>
            </button>
            <Button
              size="sm"
              onClick={() => void runRepoScan(SAMPLE_REPO)}
              disabled={scanning}
              className="h-8 shrink-0 rounded-full bg-[#9b8afb] px-3 text-xs font-semibold text-[#101218] hover:bg-[#9b8afb]/90"
            >
              {scanning ? "Scanning…" : "Try Sample"}
            </Button>
          </div>

          {scannerOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (repoInput.trim()) void runRepoScan(repoInput.trim());
              }}
              className="mt-3 space-y-2 border-t border-white/10 pt-3"
            >
              <div className="flex gap-2">
                <Input
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  aria-label="GitHub repository URL"
                  className="h-10 border-white/15 bg-[#0f131c] font-mono text-xs text-white"
                />
                <Button
                  type="submit"
                  disabled={scanning}
                  className="h-10 shrink-0 rounded-xl bg-white px-4 text-xs font-semibold text-slate-950 hover:bg-slate-200"
                >
                  {scanning ? "Reading…" : "Scan Repo"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>Quick targets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setRepoInput(SAMPLE_REPO);
                    void runRepoScan(SAMPLE_REPO);
                  }}
                  className="text-[#9b8afb] underline"
                >
                  Bundled Sample (5 gaps)
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => {
                    const url = "https://github.com/aws-samples/aws-serverless-ecommerce-platform";
                    setRepoInput(url);
                    void runRepoScan(url);
                  }}
                  className="text-[#9b8afb] underline"
                >
                  aws-serverless-ecommerce-platform
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {/* Official "Ask me anything..." Box directly below Repo button */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!askText.trim()) {
              openMcp();
              return;
            }
            const q = askText.trim();
            setAskText("");
            openMcp(q);
          }}
          className="flex items-center justify-between rounded-2xl border border-slate-600/80 bg-[#11141c] px-4 py-2.5 focus-within:border-[#9b8afb]"
        >
          <div className="flex flex-1 items-center gap-2.5">
            <Sparkles className="size-4 shrink-0 text-[#9b8afb]" />
            <input
              type="text"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Ask me anything..."
              aria-label="Ask me anything"
              className="w-full bg-transparent text-sm text-white placeholder:text-[#9b8afb]/80 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            aria-label="Send question to AWS MCP agent"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#262b38] text-slate-200 transition-colors hover:bg-[#9b8afb] hover:text-[#101218]"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>

        {/* Quick Action Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { label: "Plan my day", prompt: "Plan my day at re:Invent with walkable sessions" },
            { label: "Recommend sessions", prompt: "Recommend 300-level Bedrock and serverless sessions" },
            { label: "Find open sessions", prompt: "Find sessions with open reservable seats" },
            { label: "Tonight's parties", prompt: "What parties are happening Tuesday night at The Venetian?" },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => openMcp(chip.prompt)}
              className="shrink-0 rounded-full bg-[#1e232e] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#2a3140] hover:text-white"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      {/* Inline Repo Scan Results when a repo has been scanned */}
      {scanResult ? (
        <section className="px-4">
          <InlineScanResult
            result={scanResult}
            onClose={() => setScanResult(null)}
          />
        </section>
      ) : null}

      {/* Swipeable AI Recommendations Section (Screenshots 5 & 6) */}
      <section className="space-y-4 px-4 pt-2">
        <h2 className="text-xl font-bold leading-snug text-white">
          I have a few <span className="text-[#9b8afb]">Recommendations</span> for you based on your
          open time slots. Swipe to explore.
        </h2>

        {currentRec ? (
          <div className="space-y-4">
            <div
              onClick={() => openSession(currentRec)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openSession(currentRec);
                }
              }}
              className="cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#1e232e] transition-colors hover:border-[#9b8afb]/40"
            >
              <div
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium ${
                  currentRec.availability?.reservable === false
                    ? "bg-[#003687] text-white"
                    : "bg-[#093b2c] text-emerald-200"
                }`}
              >
                <Info className="size-4" />
                <span>
                  {currentRec.availability?.reservable === false
                    ? "Walk-up only"
                    : "Reservable seat available"}
                </span>
              </div>

              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="font-mono text-xs text-slate-300">AI Recommended</p>
                    <span className="inline-block rounded-md bg-[#c5d1db] px-2.5 py-1 font-mono text-xs font-semibold text-slate-950">
                      {String(currentRec.type || "Keynote")}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Expand session details"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSession(currentRec);
                    }}
                    className="flex size-9 items-center justify-center rounded-full bg-[#10131a] text-slate-200 hover:text-white"
                  >
                    <Maximize2 className="size-4" />
                  </button>
                </div>

                <h3 className="pt-1 text-xl font-bold leading-snug text-white">
                  {currentRec.title}
                </h3>

                <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-slate-400" />
                    {formatShortDate(currentRec.start)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5 text-slate-400" />
                    {formatClockTime(currentRec.start)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Timer className="size-3.5 text-slate-400" />
                    {formatDurationMins(currentRec.start, currentRec.end)}
                  </span>
                </div>

                {currentRec.speakers && currentRec.speakers.length > 0 ? (
                  <p className="text-xs text-slate-300">
                    <span className="font-bold text-white">Speakers </span>{" "}
                    {currentRec.speakers.slice(0, 2).join("  ")}
                    {currentRec.speakers.length > 2 ? `  +${currentRec.speakers.length - 2}` : ""}
                  </p>
                ) : null}

                <p className="line-clamp-4 text-sm leading-relaxed text-slate-200">
                  {currentRec.abstract ||
                    "Join AWS engineers and community leaders for deep architectural insights, live demonstrations, and production patterns at re:Invent 2026."}
                </p>
              </div>
            </div>

            {/* Dismiss (X) and Favorite (Heart) circular action buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Dismiss recommendation"
                onClick={handleDismissRec}
                className="flex size-11 items-center justify-center rounded-full bg-[#1e232e] text-slate-300 transition-transform hover:scale-105 hover:text-white active:scale-95"
              >
                <X className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Favorite recommended session"
                onClick={() => void handleHeartRec()}
                className="flex size-11 items-center justify-center rounded-full bg-white text-slate-950 shadow-md transition-transform hover:scale-105 active:scale-95"
              >
                <Heart
                  className={`size-5 ${
                    favIds.includes(currentRec.sessionId)
                      ? "fill-rose-500 text-rose-500"
                      : "fill-slate-950 text-slate-950"
                  }`}
                />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Quick Links Section (Screenshots 5 & 6) */}
      <section className="space-y-3 px-4 pt-2">
        <h2 className="text-lg font-bold text-white">Quick links</h2>

        <button
          type="button"
          onClick={() => openMore("faqs")}
          className="flex w-full items-center justify-between rounded-2xl bg-[#1e232e] p-5 text-left transition-colors hover:bg-[#252b38]"
        >
          <div>
            <p className="text-base font-bold text-white">FAQs</p>
            <p className="mt-1 text-xs text-slate-300">
              Got questions? We&apos;ve got the answers you need
            </p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-slate-200" />
        </button>

        <button
          type="button"
          onClick={() => openMore("sponsors")}
          className="flex w-full items-center justify-between rounded-2xl bg-[#1e232e] p-5 text-left transition-colors hover:bg-[#252b38]"
        >
          <div>
            <p className="text-base font-bold text-white">Sponsors</p>
            <p className="mt-1 text-xs text-slate-300">
              Learn about industry-leading solutions featured across the event
            </p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-slate-200" />
        </button>

        <Link
          href="/parties"
          className="flex w-full items-center justify-between rounded-2xl bg-[#1e232e] p-5 text-left transition-colors hover:bg-[#252b38]"
        >
          <div>
            <p className="text-base font-bold text-white">Conference Parties (171)</p>
            <p className="mt-1 text-xs text-slate-300">
              Unofficial vendor & community parties from conferenceparties.com with RSVP & maps
            </p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-slate-200" />
        </Link>
      </section>
    </div>
  );
}

function InlineScanResult({
  result,
  onClose,
}: {
  result: ScanResult;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"gaps" | "schedule" | "tickets">("gaps");
  const gaps = result.gaps ?? [];
  const days: PlanDay[] = result.schedule?.days ?? [];
  const tickets: Ticket[] = result.plan?.remediation?.tickets ?? [];
  const repoName = `${result.fingerprint.repo.owner}/${result.fingerprint.repo.repo}`;

  return (
    <div className="space-y-4 rounded-2xl border border-[#9b8afb]/40 bg-[#141822] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#9b8afb] text-[10px] font-bold text-[#101218]">
              repo:Invent Diagnosis
            </Badge>
            <span className="font-mono text-[11px] text-slate-400">
              source: {result.snapshotSource}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">{repoName}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {result.fingerprint.services.map((s) => (
              <span
                key={s.service}
                className="rounded-full bg-[#1e2433] px-2 py-0.5 font-mono text-[10px] text-slate-300"
              >
                {s.service}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scan result"
          className="rounded-full p-1 text-slate-400 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#0e1118] p-1">
        <button
          type="button"
          onClick={() => setTab("gaps")}
          className={`rounded-lg py-1.5 text-xs font-semibold ${
            tab === "gaps" ? "bg-[#9b8afb] text-[#101218]" : "text-slate-300"
          }`}
        >
          Gaps ({gaps.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("schedule")}
          className={`rounded-lg py-1.5 text-xs font-semibold ${
            tab === "schedule" ? "bg-[#9b8afb] text-[#101218]" : "text-slate-300"
          }`}
        >
          Week Plan ({days.reduce((s, d) => s + d.items.length, 0)})
        </button>
        <button
          type="button"
          onClick={() => setTab("tickets")}
          className={`rounded-lg py-1.5 text-xs font-semibold ${
            tab === "tickets" ? "bg-[#9b8afb] text-[#101218]" : "text-slate-300"
          }`}
        >
          Tickets ({tickets.length})
        </button>
      </div>

      {tab === "gaps" ? (
        <div className="space-y-2.5">
          {gaps.map((g) => (
            <div key={g.id} className="rounded-xl border border-white/10 bg-[#1b202d] p-3">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    g.severity === "high"
                      ? "bg-[#e96d63]/20 text-[#e96d63]"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {g.severity}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Target: Level {g.targetLevel}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-white">{g.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{g.why}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date} className="space-y-1.5">
              <p className="font-mono text-xs font-semibold text-[#9b8afb]">{d.date}</p>
              {d.items.map((item) => (
                <div
                  key={`${d.date}-${item.sessionId}-${item.start}`}
                  className="rounded-xl border border-white/10 bg-[#1b202d] p-3 text-xs"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                    <span>
                      {String(item.start).slice(11, 16)} – {String(item.end).slice(11, 16)}
                    </span>
                    <span className="text-emerald-300">{item.action}</span>
                  </div>
                  <p className="mt-1 font-bold text-white">{item.title}</p>
                  <p className="mt-0.5 text-slate-300">
                    {item.venue} • Closes {item.gaps.length} gap(s)
                  </p>
                  {item.note ? <p className="mt-1 text-[11px] text-slate-400">{item.note}</p> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {tab === "tickets" ? (
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-[#1b202d] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-[#9b8afb]">{t.id}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-200">
                  Effort: {t.effort}
                </span>
              </div>
              <p className="mt-1 text-sm font-bold text-white">{t.title}</p>
              <p className="mt-1 font-mono text-[11px] text-emerald-300">
                Acceptance: {t.acceptanceTest}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-xs">
        <Link href="/calendar" className="font-semibold text-[#9b8afb] hover:underline">
          View on Calendar →
        </Link>
        <a
          href={`/api/report?repo=${encodeURIComponent(repoName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-[#2ea8ff] hover:underline"
        >
          Printable Report <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

function formatShortDate(iso: string | undefined): string {
  const d = String(iso ?? "").slice(0, 10);
  if (d === "2026-11-29") return "November 29";
  if (d === "2026-11-30") return "November 30";
  if (d === "2026-12-01") return "December 1";
  if (d === "2026-12-02") return "December 2";
  if (d === "2026-12-03") return "December 3";
  if (d === "2026-12-04") return "December 4";
  return "November 30";
}

function formatClockTime(iso: string | undefined): string {
  const m = /T(\d{2}):(\d{2})/.exec(String(iso ?? ""));
  if (!m) return "07:30 PM";
  const h = Number(m[1]);
  const min = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${min} ${suffix}`;
}

function formatDurationMins(start: string | undefined, end: string | undefined): string {
  const a = Date.parse(String(start ?? ""));
  const b = Date.parse(String(end ?? ""));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "75 min";
  return `${Math.round((b - a) / 60000)} min`;
}
