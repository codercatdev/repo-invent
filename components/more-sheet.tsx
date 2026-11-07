"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  Info,
  QrCode,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getLastScan,
  getLocalReflections,
  saveLocalReflection,
  type LocalReflection,
} from "@/lib/app-store";

type SubView =
  | "main"
  | "surveys"
  | "profile"
  | "badge"
  | "faqs"
  | "sponsors"
  | "disclosures"
  | "events";

const FAQS = [
  {
    q: "How does the 10-minute seat forfeiture rule work?",
    a: "Reserved seats are held until 10 minutes before the session starts. At T-10 minutes, unclaimed reserved seats are released to the walk-up line. Our planner's Transit Guard adds 10 minutes + inter-venue walking/shuttle time to every transfer so you never forfeit a seat.",
  },
  {
    q: "What if a session shows Walk-up only or Session Full?",
    a: "25%+ of seating in every breakout and chalk talk is held for the walk-up queue. Favorite the session in the app and arrive 15–20 minutes early.",
  },
  {
    q: "Where can I pick up my re:Invent badge?",
    a: "Badge pickup is open at Harry Reid International Airport (Baggage Claim), The Venetian, Caesars Forum, Wynn, and MGM Grand starting Sunday, November 29. Open 'Your badge pickup code' in More to display your QR code.",
  },
  {
    q: "How do Campus Shuttles work between venues?",
    a: "Dedicated re:Invent shuttles run continuously between The Venetian, Wynn/Encore, Caesars Forum, Caesars Palace, MGM Grand, and Mandalay Bay. Walking between The Venetian, Wynn, and Caesars Forum takes 12–18 minutes.",
  },
  {
    q: "How does Repo:Invent diagnose my GitHub repository?",
    a: "Paste any public GitHub URL (or click Sample) on Home. Repo:Invent reads up to 40 manifest and IaC files (package.json, requirements.txt, pyproject.toml, go.mod, Terraform .tf, CDK TypeScript & Python stacks, Dockerfile) without cloning, diagnoses architectural gaps, and prescribes the walkable sessions that close them.",
  },
];

const SPONSORS = [
  { name: "Datadog", tier: "Emerald", booth: "Venetian Booth #412", parties: 4 },
  { name: "Snowflake", tier: "Emerald", booth: "Venetian Booth #504", parties: 3 },
  { name: "Anthropic", tier: "Emerald", booth: "Venetian AI Zone #102", parties: 2 },
  { name: "NVIDIA", tier: "Emerald", booth: "Venetian Booth #300", parties: 3 },
  { name: "Stripe", tier: "Diamond", booth: "Venetian Booth #718", parties: 3 },
  { name: "MongoDB", tier: "Diamond", booth: "Venetian Booth #610", parties: 2 },
  { name: "Dynatrace", tier: "Diamond", booth: "Venetian Booth #812", parties: 3 },
  { name: "HashiCorp (IBM)", tier: "Platinum", booth: "Venetian Booth #902", parties: 2 },
  { name: " Wiz", tier: "Diamond", booth: "Venetian Security Zone #214", parties: 2 },
  { name: "GitLab", tier: "Platinum", booth: "Venetian Booth #1015", parties: 2 },
];

export function MoreSheet({
  open,
  onOpenChange,
  initialSubView = "main",
  onSwitchInterface,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSubView?: SubView;
  onSwitchInterface?: () => void;
}) {
  const [view, setView] = useState<SubView>(initialSubView);
  const [signedIn, setSignedIn] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | undefined>(undefined);
  const [reflections, setReflections] = useState<LocalReflection[]>([]);
  const [eventsList, setEventsList] = useState<
    Array<{ eventId: string; name: string; startDate: string; endDate: string; city?: string }>
  >([]);

  useEffect(() => {
    if (open) {
      setView(initialSubView);
      setReflections(getLocalReflections());
      fetch("/api/session")
        .then((r) => r.json())
        .then((d: { signedIn?: boolean; expiresInSeconds?: number }) => {
          setSignedIn(Boolean(d.signedIn));
          setExpiresIn(d.expiresInSeconds);
        })
        .catch(() => setSignedIn(false));
    }
  }, [open, initialSubView]);

  async function openEvents() {
    setView("events");
    try {
      const r = await fetch("/api/events");
      const d = (await r.json()) as {
        events?: Array<{ eventId: string; name: string; startDate: string; endDate: string; city?: string }>;
      };
      setEventsList(d.events ?? []);
    } catch {
      setEventsList([]);
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/session", { method: "DELETE" });
      setSignedIn(false);
      toast.success("Signed out of AWS Builder ID.");
    } catch {
      toast.error("Sign out request failed.");
    }
  }

  const lastScan = typeof window !== "undefined" ? getLastScan() : null;
  const closedGapsCount = reflections.filter((r) => r.rating >= 3).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="mx-auto flex h-dvh w-full max-w-[520px] flex-col border-l border-white/10 bg-[#0b0d13] p-0 text-white"
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-white/10 px-5 py-4">
          {view !== "main" ? (
            <button
              type="button"
              onClick={() => setView("main")}
              className="flex items-center gap-1 text-sm text-[#2ea8ff]"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          ) : (
            <span className="w-12" />
          )}
          <SheetTitle className="text-base font-bold text-white">
            {view === "main"
              ? "More"
              : view === "surveys"
                ? "Surveys & Reflections"
                : view === "profile"
                  ? "Profile & Settings"
                  : view === "badge"
                    ? "Badge Pickup Code"
                    : view === "faqs"
                      ? "FAQs"
                      : view === "sponsors"
                        ? "Sponsors"
                        : view === "events"
                          ? "AWS Events"
                          : "Info & Disclosures"}
          </SheetTitle>
          <SheetDescription className="sr-only">More menu and event information</SheetDescription>
          <button
            type="button"
            aria-label="Close More menu"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </SheetHeader>

        {view === "main" ? (
          <div className="flex-1 overflow-y-auto pb-10">
            <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl bg-[#222630] px-4 py-3 text-xs text-slate-200">
              <Info className="size-4 shrink-0 text-[#2ea8ff]" />
              <span>Looking for a different event?</span>
              <button
                type="button"
                onClick={() => void openEvents()}
                className="font-semibold text-[#2ea8ff] underline"
              >
                View events
              </button>
            </div>

            <div className="mt-2.5 flex items-center justify-between bg-[#003181] px-4 py-2.5 text-xs text-white">
              <div className="flex items-center gap-2">
                <Info className="size-4 shrink-0 text-[#5ab4ff]" />
                <span>Switch to a familiar app interface.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onSwitchInterface) onSwitchInterface();
                  onOpenChange(false);
                }}
                className="font-semibold text-[#5ab4ff] hover:underline"
              >
                Switch
              </button>
            </div>

            <div className="mt-6 space-y-6 px-5">
              <section>
                <h3 className="mb-2 text-lg font-bold text-white">Your info</h3>
                <div className="divide-y divide-white/15 border-b border-white/15">
                  <button
                    type="button"
                    onClick={() => setView("surveys")}
                    className="flex w-full items-center justify-between py-4 text-left text-sm text-slate-100 hover:text-[#9b8afb]"
                  >
                    <span>Surveys</span>
                    <div className="flex items-center gap-2">
                      {reflections.length > 0 ? (
                        <span className="rounded-full bg-[#9b8afb]/20 px-2 py-0.5 font-mono text-xs text-[#9b8afb]">
                          {reflections.length} rated
                        </span>
                      ) : null}
                      <ChevronRight className="size-4 text-slate-400" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("profile")}
                    className="flex w-full items-center justify-between py-4 text-left text-sm text-slate-100 hover:text-[#9b8afb]"
                  >
                    <span>Your profile and settings</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("badge")}
                    className="flex w-full items-center justify-between py-4 text-left text-sm text-slate-100 hover:text-[#9b8afb]"
                  >
                    <span>Your badge pickup code</span>
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded bg-white p-0.5 text-black">
                        <QrCode className="size-5" />
                      </span>
                      <ChevronRight className="size-4 text-slate-400" />
                    </div>
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-lg font-bold text-white">Event info</h3>
                <div className="divide-y divide-white/15 border-b border-white/15">
                  <button
                    type="button"
                    onClick={() => setView("faqs")}
                    className="flex w-full items-center justify-between py-4 text-left text-sm text-slate-100 hover:text-[#9b8afb]"
                  >
                    <span>FAQs</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("sponsors")}
                    className="flex w-full items-center justify-between py-4 text-left text-sm text-slate-100 hover:text-[#9b8afb]"
                  >
                    <span>Sponsors</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-lg font-bold text-white">About this app</h3>
                <div className="divide-y divide-white/15 border-b border-white/15">
                  <button
                    type="button"
                    onClick={() => setView("disclosures")}
                    className="flex w-full items-center justify-between py-4 text-left text-sm text-slate-100 hover:text-[#9b8afb]"
                  >
                    <span>Info and disclosures</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </button>
                </div>
              </section>

              <div className="pt-8 text-center">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="text-sm font-semibold text-[#2ea8ff] hover:underline"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view === "surveys" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-2xl border border-[#9b8afb]/30 bg-[#151a26] p-4">
              <p className="text-sm font-bold text-white">
                Session Surveys & Architecture Gap Closure
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Rate any session 3★ or higher to mark the repository architecture gaps it covers as
                addressed. You have rated <strong>{reflections.length}</strong> session(s) and closed{" "}
                <strong>{closedGapsCount}</strong> gap target(s).
              </p>
            </div>

            {lastScan?.schedule?.days ? (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Prescribed Sessions from {lastScan.fingerprint.repo.owner}/
                  {lastScan.fingerprint.repo.repo}
                </h4>
                {lastScan.schedule.days
                  .flatMap((d) => d.items)
                  .filter((item) => item.action !== "personal-time")
                  .map((item) => {
                    const saved = reflections.find((r) => r.sessionId === item.sessionId);
                    return (
                      <div
                        key={`${item.sessionId}-${item.start}`}
                        className="space-y-2 rounded-2xl border border-white/10 bg-[#161b26] p-3.5"
                      >
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="font-mono text-xs text-slate-400">
                          {item.venue} • Closes {item.gaps.length} gap(s)
                        </p>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                const updated = saveLocalReflection({
                                  sessionId: item.sessionId,
                                  title: item.title,
                                  rating: n,
                                  note: saved?.note ?? "",
                                  updatedAt: new Date().toISOString(),
                                });
                                setReflections(updated);
                                toast.success(`Rated ${n}/5 ★`);
                              }}
                              className="p-1"
                            >
                              <Star
                                className={`size-4 ${
                                  (saved?.rating ?? 0) >= n
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-slate-600"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : null}

            {reflections.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Your Completed Session Surveys
                </h4>
                {reflections.map((r) => (
                  <div
                    key={r.sessionId}
                    className="rounded-xl border border-white/10 bg-[#161b26] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{r.title}</span>
                      <span className="font-mono text-amber-400">{"★".repeat(r.rating)}</span>
                    </div>
                    {r.note ? <p className="mt-1 text-slate-300">{r.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Tap any session in the Catalog or Home recommendations to rate it and record notes.
              </p>
            )}
          </div>
        ) : null}

        {view === "profile" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
            <div className="space-y-2 rounded-2xl border border-white/10 bg-[#151a24] p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">AWS Builder ID (OAuth 2.0 PKCE)</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${
                    signedIn
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {signedIn ? "Connected" : "Signed Out"}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {signedIn
                  ? `Active OAuth token for event reinvent2026 (${
                      expiresIn ? `expires in ${Math.round(expiresIn / 60)} min` : "valid"
                    }).`
                  : "AWS Events OAuth requires a loopback redirect on http://localhost:8484/callback. Run `pnpm cli login` in your terminal to sign in."}
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 bg-[#151a24] p-4">
              <p className="font-semibold text-white">MCP & WebMCP Endpoints</p>
              <p className="font-mono text-xs text-slate-300">
                Remote MCP: https://api.awsevents.com/mcp
              </p>
              <p className="font-mono text-xs text-slate-300">
                REST Base: https://api.awsevents.com/v1
              </p>
              <p className="font-mono text-xs text-slate-300">
                Browser WebMCP: navigator.modelContext / window.webMcp
              </p>
            </div>
          </div>
        ) : null}

        {view === "badge" ? (
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-center">
            <div className="mx-auto max-w-xs space-y-3 rounded-3xl border border-white/15 bg-white p-6 text-slate-950 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                AWS re:Invent 2026 • Las Vegas
              </p>
              <div className="mx-auto flex size-48 items-center justify-center rounded-2xl border-2 border-slate-900 bg-white p-3">
                <QrCode className="size-40 text-slate-950" strokeWidth={1.5} />
              </div>
              <p className="font-mono text-sm font-bold">ATTENDEE • REINVENT-2026-PKCE</p>
              <p className="text-xs text-slate-600">
                Present this code with a government-issued photo ID at any campus badge pickup desk.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 bg-[#151a24] p-4 text-left text-xs text-slate-300">
              <p className="font-semibold text-white">Badge Pickup Locations</p>
              <p>• The Venetian — Hall G & Sands Expo Lobby (Sun 7 AM – 8 PM, Mon–Fri 6:30 AM – 6 PM)</p>
              <p>• Caesars Forum — Academy Ballroom</p>
              <p>• MGM Grand — Conference Center Foyer</p>
              <p>• Wynn — Convention Promenade</p>
              <p>• Harry Reid Airport (LAS) — Terminal 1 & Terminal 3 Baggage Claim</p>
            </div>
          </div>
        ) : null}

        {view === "faqs" ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {FAQS.map((item) => (
              <div
                key={item.q}
                className="space-y-1.5 rounded-2xl border border-white/10 bg-[#151a24] p-4"
              >
                <p className="text-sm font-semibold text-white">{item.q}</p>
                <p className="text-xs leading-relaxed text-slate-300">{item.a}</p>
              </div>
            ))}
          </div>
        ) : null}

        {view === "sponsors" ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {SPONSORS.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#151a24] p-4"
              >
                <div>
                  <p className="text-sm font-bold text-white">{s.name}</p>
                  <p className="text-xs text-slate-400">
                    {s.tier} Sponsor • {s.booth}
                  </p>
                </div>
                <span className="rounded-full bg-[#9b8afb]/20 px-2.5 py-1 font-mono text-xs text-[#9b8afb]">
                  {s.parties} parties
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {view === "events" ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            <p className="text-xs text-slate-400">
              Loaded from `ListEvents` & `GetEvent` on `https://api.awsevents.com/v1`:
            </p>
            {eventsList.map((ev) => (
              <div
                key={ev.eventId}
                className="rounded-2xl border border-[#2ea8ff]/40 bg-[#151a24] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white">{ev.name}</p>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                    Active
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-300">
                  ID: {ev.eventId} • {ev.city ?? "Las Vegas, NV"}
                </p>
                <p className="font-mono text-xs text-slate-400">
                  {String(ev.startDate).slice(0, 10)} → {String(ev.endDate).slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {view === "disclosures" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs leading-relaxed text-slate-300">
            <div className="space-y-2 rounded-2xl border border-white/10 bg-[#151a24] p-4">
              <p className="text-sm font-bold text-white">repo:Invent — AWS re:Invent 2026 Hackathon</p>
              <p>
                Built with Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS v4, and the AWS
                Events Catalog REST API + Remote MCP Server (`https://api.awsevents.com/mcp`).
              </p>
              <p>
                Implements all 12 AWS Events operations (`ListEvents`, `GetEvent`, `ListSessions`,
                `GetSession`, `GetSchedule`, `ReserveSessions`, `CancelReservation`,
                `AssociateFavorites`, `DisassociateFavorite`, `CreatePersonalTime`,
                `UpdatePersonalTime`, `DeletePersonalTime`), GitHub repository static analysis,
                10-minute seat forfeiture transit guard, WebMCP (`navigator.modelContext`), and 171
                community parties from conferenceparties.com.
              </p>
            </div>
            <Button
              onClick={() => window.open("/api/report?repo=sample://reinvent-demo-shop", "_blank")}
              className="w-full rounded-full bg-[#9b8afb] font-semibold text-[#11131a]"
            >
              Open Printable Remediation & Schedule Report
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
