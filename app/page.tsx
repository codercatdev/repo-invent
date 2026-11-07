"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUp,
  Calendar,
  Clock,
  ExternalLink,
  Flame,
  GitBranch,
  Heart,
  Info,
  LogIn,
  Maximize2,
  Sparkles,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    badge: "Quest 1",
    detailTitle: "Reserved Seating & Walk-Up Rules",
    detailBody:
      "Reserved seating is live via ReserveSessions on the AWS Events API. Remember the 10-minute seat forfeiture rule: reserved seats are released to the walk-up line 10 minutes before start time.",
    ctaLabel: "Browse Open Seats in Catalog",
    ctaHref: "/catalog?filter=open",
  },
  {
    id: "know",
    title: "Know before you go",
    badge: "Quest 2",
    detailTitle: "Know Before You Go: Las Vegas Campus",
    detailBody:
      "Pick up your badge at Harry Reid Airport (LAS) or The Venetian, Caesars Forum, Wynn, or MGM Grand. Wear comfortable shoes—walking Venetian to Wynn takes 18 minutes.",
    ctaLabel: "Open Badge Pickup QR Code",
    ctaAction: "badge" as const,
  },
  {
    id: "week",
    title: "Your week, your way",
    badge: "Quest 3",
    detailTitle: "Your Week, Your Way: Repo-Driven Planning",
    detailBody:
      "Scan your GitHub repository to automatically diagnose AWS architecture gaps, prescribe a walkable 5-day schedule, and export remediation tickets with acceptance tests.",
    ctaLabel: "Scan Sample Repository",
    ctaAction: "scan" as const,
  },
  {
    id: "keynotes",
    title: "Keynotes at re:Invent",
    badge: "Quest 4",
    detailTitle: "Featured Keynotes at re:Invent 2026",
    detailBody:
      "Don't miss the CEO Keynote, Developer Keynote (Eric Johnson & Marc Brooker), AI & Data Keynote, and Infrastructure Keynote.",
    ctaLabel: "Filter Keynotes in Catalog",
    ctaHref: "/catalog?q=Keynote",
  },
  {
    id: "parties",
    title: "171 Vegas Parties",
    badge: "Bonus",
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
    speakers: ["Eric Johnson", "Marc Brooker", "Emily Freeman"],
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
  const { openMcp, openMore, openSession, signedIn } = useAppShell();

  const [activeStory, setActiveStory] = useState<(typeof STORIES)[number] | null>(null);
  const [catalog, setCatalog] = useState<ReinventSession[]>([]);
  const [askText, setAskText] = useState("");

  // Repo Scanner state (right on top of the Ask AWS button!)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [repoInput, setRepoInput] = useState(
    "https://github.com/aws-samples/aws-serverless-ecommerce-platform",
  );
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

  const currentRec =
    recommendations[recIndex % Math.max(1, recommendations.length)] ?? CURATED_RECOMMENDATIONS[0];

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
        `+100 XP! Scanned ${data.fingerprint.repo.owner}/${data.fingerprint.repo.repo}: ${data.gaps.length} architecture gaps found!`,
      );
      setTimeout(() => {
        document.getElementById("scan-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
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
    toast.success(`+25 XP! Saved "${currentRec.title}" to your Favorites!`);
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
    <div className="space-y-8 pb-8">
      {/* Authentication Prompt Banner when not signed in */}
      {!signedIn ? (
        <div className="card-tactile flex flex-wrap items-center justify-between gap-3 bg-secondary/40 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-primary bg-primary/15 text-primary">
              <LogIn className="size-5" />
            </span>
            <div>
              <p className="font-heading text-sm font-black">
                Connect your AWS Builder ID to sync live reservations
              </p>
              <p className="text-xs text-muted-foreground">
                Sign in via OAuth 2.0 PKCE (`localhost:8484`) to write reservations, favorites, and
                personal time to the live AWS Events API.
              </p>
            </div>
          </div>
          <Link href="/login">
            <Button size="sm">Sign In with Builder ID</Button>
          </Link>
        </div>
      ) : null}

      {/* Top Story Quest Cards */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STORIES.map((story, idx) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setActiveStory(story)}
              className="card-tactile-interactive flex min-h-[120px] flex-col justify-between p-4 text-left"
            >
              <div className="flex items-center justify-between">
                <Badge variant={idx === 0 ? "default" : "secondary"} className="text-[11px] font-extrabold">
                  {story.badge}
                </Badge>
                <Flame className="size-4 text-amber-500" />
              </div>
              <span className="font-heading text-sm font-extrabold leading-snug">
                {story.title}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Story Modal if clicked */}
      {activeStory ? (
        <Card className="animate-bounce-pop border-primary bg-primary/5">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">{activeStory.detailTitle}</CardTitle>
              <Button variant="ghost" size="icon-xs" onClick={() => setActiveStory(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <CardDescription>{activeStory.detailBody}</CardDescription>
          </CardHeader>
          <CardContent>
            {activeStory.ctaHref ? (
              <Button
                size="sm"
                onClick={() => {
                  const href = activeStory.ctaHref!;
                  setActiveStory(null);
                  router.push(href);
                }}
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
              >
                {activeStory.ctaLabel}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Main Two-Column Grid on Desktop / Single Column on Mobile */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Hero Greeting + Seat Alerts + Repo Scanner + Ask AWS */}
        <div className="space-y-6 lg:col-span-7">
          <section className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-primary/30 bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">
              <Sparkles className="size-3.5" />
              <span>AI + MCP Powered Companion</span>
            </div>
            <h1 className="font-heading text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              Good afternoon! Let&apos;s level up your{" "}
              <span className="text-primary">re:Invent 2026</span> week.
            </h1>
          </section>

          {/* Session Alerts Card */}
          <button
            type="button"
            onClick={() => router.push("/catalog?filter=open")}
            className="card-tactile-interactive flex w-full items-center justify-between p-5 text-left"
          >
            <div className="space-y-1">
              <Badge variant="destructive" className="font-mono text-xs font-bold">
                Few seats left
              </Badge>
              <p className="font-heading pt-1 text-lg font-black">{alertCount} session alerts</p>
              <p className="text-xs font-medium text-muted-foreground">
                Seats are filling up — reserve now or plan walk-up buffers
              </p>
            </div>
            <span className="btn-tactile flex size-10 items-center justify-center rounded-2xl">
              <ArrowRight className="size-5" />
            </span>
          </button>

          {/* "What can I help you get done?" + Repo Scanner Button RIGHT ON TOP of Ask AWS */}
          <section className="space-y-4">
            <h2 className="font-heading text-xl font-black">What can I help you get done?</h2>

            {/* OUR REPO:INVENT BUTTON RIGHT ON TOP OF THE ASK AWS BUTTON */}
            <div className="card-tactile border-primary bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setScannerOpen((prev) => !prev)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-primary bg-primary text-primary-foreground shadow-tactile-primary">
                    <GitBranch className="size-5" />
                  </span>
                  <div>
                    <p className="font-heading text-base font-black">
                      Scan GitHub Repo for AWS Suggestions
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      Diagnose architecture gaps → prescribe walkable sessions & tickets
                    </p>
                  </div>
                </button>
                <Button
                  size="sm"
                  onClick={() => void runRepoScan(SAMPLE_REPO)}
                  disabled={scanning}
                >
                  <Trophy className="size-4" />
                  {scanning ? "Scanning…" : "Try Sample Repo"}
                </Button>
              </div>

              {scannerOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (repoInput.trim()) void runRepoScan(repoInput.trim());
                  }}
                  className="mt-4 space-y-2.5 border-t-2 border-border pt-3"
                >
                  <div className="flex gap-2">
                    <Input
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      aria-label="GitHub repository URL"
                      className="font-mono text-xs"
                    />
                    <Button type="submit" variant="secondary" disabled={scanning}>
                      {scanning ? "Reading…" : "Scan Repo"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-bold">Quick targets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRepoInput(SAMPLE_REPO);
                        void runRepoScan(SAMPLE_REPO);
                      }}
                      className="font-extrabold text-primary underline"
                    >
                      Bundled Sample (6 gaps)
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        const url =
                          "https://github.com/aws-samples/aws-serverless-ecommerce-platform";
                        setRepoInput(url);
                        void runRepoScan(url);
                      }}
                      className="font-extrabold text-primary underline"
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
              className="card-tactile flex items-center justify-between gap-2 px-4 py-2"
            >
              <div className="flex flex-1 items-center gap-2.5">
                <Sparkles className="size-5 shrink-0 text-primary" />
                <input
                  type="text"
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  placeholder="Ask me anything about re:Invent, sessions, or parties..."
                  aria-label="Ask me anything"
                  className="w-full bg-transparent py-1.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <Button type="submit" size="icon-sm" aria-label="Send question to AWS MCP agent">
                <ArrowUp className="size-4" />
              </Button>
            </form>

            {/* Quick Action Chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Plan my day", prompt: "Plan my day at re:Invent with walkable sessions" },
                {
                  label: "Recommend sessions",
                  prompt: "Recommend 300-level Bedrock and serverless sessions",
                },
                { label: "Find open sessions", prompt: "Find sessions with open reservable seats" },
                {
                  label: "Tonight's parties",
                  prompt: "What parties are happening Tuesday night at The Venetian?",
                },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => openMcp(chip.prompt)}
                  className="chip-tactile"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </section>

          {/* Inline Repo Scan Results when a repo has been scanned */}
          {scanResult ? (
            <InlineScanResult result={scanResult} onClose={() => setScanResult(null)} />
          ) : null}
        </div>

        {/* Right Column: Swipeable AI Recommendations + Quick Links */}
        <div className="space-y-6 lg:col-span-5">
          <section className="space-y-4">
            <h2 className="font-heading text-xl font-black leading-snug">
              I have a few <span className="text-primary">Recommendations</span> for you based on
              your open time slots.
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
                  className="card-tactile-interactive overflow-hidden p-0"
                >
                  <div
                    className={`flex items-center gap-2 border-b-2 border-border px-4 py-2.5 text-xs font-extrabold ${
                      currentRec.availability?.reservable === false
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary/15 text-primary"
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
                      <div className="space-y-1.5">
                        <p className="font-mono text-xs font-bold text-muted-foreground">
                          AI Recommended
                        </p>
                        <Badge variant="secondary" className="font-mono text-xs font-extrabold">
                          {String(currentRec.type || "Keynote")}
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Expand session details"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSession(currentRec);
                        }}
                      >
                        <Maximize2 className="size-4" />
                      </Button>
                    </div>

                    <h3 className="font-heading pt-1 text-xl font-black leading-snug">
                      {currentRec.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-4 font-mono text-xs font-semibold text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        {formatShortDate(currentRec.start)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        {formatClockTime(currentRec.start)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Timer className="size-3.5" />
                        {formatDurationMins(currentRec.start, currentRec.end)}
                      </span>
                    </div>

                    {currentRec.speakers && currentRec.speakers.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-extrabold text-foreground">Speakers: </span>
                        {currentRec.speakers.slice(0, 2).join(" • ")}
                        {currentRec.speakers.length > 2
                          ? ` +${currentRec.speakers.length - 2}`
                          : ""}
                      </p>
                    ) : null}

                    <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                      {currentRec.abstract ||
                        "Join AWS engineers and community leaders for deep architectural insights, live demonstrations, and production patterns at re:Invent 2026."}
                    </p>
                  </div>
                </div>

                {/* Dismiss (X) and Favorite (Heart) tactile circular action buttons */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label="Dismiss recommendation"
                    onClick={handleDismissRec}
                  >
                    <X className="size-5" />
                  </Button>
                  <Button
                    variant="default"
                    size="icon-lg"
                    aria-label="Favorite recommended session"
                    onClick={() => void handleHeartRec()}
                  >
                    <Heart
                      className={`size-5 ${
                        favIds.includes(currentRec.sessionId) ? "fill-current" : ""
                      }`}
                    />
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Quick Links Section */}
          <section className="space-y-3 pt-2">
            <h2 className="font-heading text-lg font-black">Quick links</h2>

            <button
              type="button"
              onClick={() => openMore("faqs")}
              className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left"
            >
              <div>
                <p className="font-heading text-base font-extrabold">FAQs</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Got questions? We&apos;ve got the answers you need
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-primary" />
            </button>

            <button
              type="button"
              onClick={() => openMore("sponsors")}
              className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left"
            >
              <div>
                <p className="font-heading text-base font-extrabold">Sponsors</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Learn about industry-leading solutions featured across the event
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-primary" />
            </button>

            <Link
              href="/parties"
              className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left"
            >
              <div>
                <p className="font-heading text-base font-extrabold">Conference Parties (171)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Unofficial vendor & community parties from conferenceparties.com with RSVP & maps
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-primary" />
            </Link>
          </section>
        </div>
      </div>
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
    <div id="scan-results" className="card-tactile animate-float-up space-y-4 p-5 scroll-mt-24">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge>repo:Invent Diagnosis</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              source: {result.snapshotSource}
            </span>
          </div>
          <h3 className="font-heading mt-1 text-lg font-black">{repoName}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {result.fingerprint.services.map((s) => (
              <Badge key={s.service} variant="secondary" className="font-mono text-[11px]">
                {s.service}
              </Badge>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close scan result">
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          size="sm"
          variant={tab === "gaps" ? "default" : "outline"}
          onClick={() => setTab("gaps")}
        >
          Gaps ({gaps.length})
        </Button>
        <Button
          size="sm"
          variant={tab === "schedule" ? "default" : "outline"}
          onClick={() => setTab("schedule")}
        >
          Week Plan ({days.reduce((s, d) => s + d.items.length, 0)})
        </Button>
        <Button
          size="sm"
          variant={tab === "tickets" ? "default" : "outline"}
          onClick={() => setTab("tickets")}
        >
          Tickets ({tickets.length})
        </Button>
      </div>

      {tab === "gaps" ? (
        <div className="space-y-2.5">
          {gaps.map((g) => (
            <div key={g.id} className="rounded-2xl border-2 border-border bg-muted/40 p-3.5">
              <div className="flex items-center justify-between">
                <Badge variant={g.severity === "high" ? "destructive" : "secondary"}>
                  {g.severity}
                </Badge>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  Target: Level {g.targetLevel}
                </span>
              </div>
              <p className="font-heading mt-1.5 text-sm font-extrabold">{g.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.why}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date} className="space-y-1.5">
              <p className="font-mono text-xs font-extrabold text-primary">{d.date}</p>
              {d.items.map((item) => (
                <div
                  key={`${d.date}-${item.sessionId}-${item.start}`}
                  className="rounded-2xl border-2 border-border bg-muted/40 p-3 text-xs"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                    <span>
                      {String(item.start).slice(11, 16)} – {String(item.end).slice(11, 16)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.action}
                    </Badge>
                  </div>
                  <p className="font-heading mt-1 font-extrabold">{item.title}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {item.venue} • Closes {item.gaps.length} gap(s)
                  </p>
                  {item.note ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {tab === "tickets" ? (
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-2xl border-2 border-border bg-muted/40 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-extrabold text-primary">{t.id}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  Effort: {t.effort}
                </Badge>
              </div>
              <p className="font-heading mt-1 text-sm font-extrabold">{t.title}</p>
              <p className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground">
                Acceptance: {t.acceptanceTest}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t-2 border-border pt-3 text-xs">
        <Link href="/calendar" className="font-extrabold text-primary hover:underline">
          View on Calendar →
        </Link>
        <a
          href={`/api/report?repo=${encodeURIComponent(repoName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline"
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
