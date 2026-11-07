"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  Info,
  LogIn,
  LogOut,
  QrCode,
  Star,
  X,
} from "lucide-react";
import { QrCodeSvg } from "@/components/qr-code";
import { Badge } from "@/components/ui/badge";
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
  { name: "Wiz", tier: "Diamond", booth: "Venetian Security Zone #214", parties: 2 },
  { name: "GitLab", tier: "Platinum", booth: "Venetian Booth #1015", parties: 2 },
];

export function MoreSheet({
  open,
  onOpenChange,
  initialSubView = "main",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSubView?: SubView;
}) {
  const router = useRouter();
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

  const lastScan = typeof window !== "undefined" ? getLastScan() : null;
  const closedGapsCount = reflections.filter((r) => r.rating >= 3).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-dvh w-full max-w-md flex-col border-l-2 border-border bg-background p-0 text-foreground"
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b-2 border-border px-5 py-4">
          {view !== "main" ? (
            <button
              type="button"
              onClick={() => setView("main")}
              className="flex items-center gap-1 text-sm font-extrabold text-primary"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          ) : (
            <span className="w-12" />
          )}
          <SheetTitle className="font-heading text-base font-black text-foreground">
            {view === "main"
              ? "More"
              : view === "surveys"
                ? "Surveys & Gap Quest"
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close More menu"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" />
          </Button>
        </SheetHeader>

        {view === "main" ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="card-tactile mb-5 flex items-center justify-between p-3.5 text-xs">
              <div className="flex items-center gap-2">
                <Info className="size-4 shrink-0 text-primary" />
                <span className="font-semibold">Looking for a different event?</span>
              </div>
              <button
                type="button"
                onClick={() => void openEvents()}
                className="font-extrabold text-primary underline"
              >
                View events
              </button>
            </div>

            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="font-heading text-sm font-black uppercase tracking-wider text-muted-foreground">
                  Your info
                </h3>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setView("surveys")}
                    className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left text-sm font-bold"
                  >
                    <span>Surveys & Gap Quest</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{reflections.length * 50} XP</Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("profile")}
                    className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left text-sm font-bold"
                  >
                    <span>Your profile and settings</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={signedIn ? "default" : "outline"}>
                        {signedIn ? "Signed In" : "Guest"}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("badge")}
                    className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left text-sm font-bold"
                  >
                    <span>Your badge pickup code</span>
                    <div className="flex items-center gap-2">
                      <QrCode className="size-5 text-primary" />
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-heading text-sm font-black uppercase tracking-wider text-muted-foreground">
                  Event info
                </h3>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setView("faqs")}
                    className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left text-sm font-bold"
                  >
                    <span>FAQs</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("sponsors")}
                    className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left text-sm font-bold"
                  >
                    <span>Sponsors</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-heading text-sm font-black uppercase tracking-wider text-muted-foreground">
                  About this app
                </h3>
                <button
                  type="button"
                  onClick={() => setView("disclosures")}
                  className="card-tactile-interactive flex w-full items-center justify-between p-4 text-left text-sm font-bold"
                >
                  <span>Info and disclosures</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </section>

              <div className="pt-4">
                {signedIn ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      onOpenChange(false);
                      router.push("/logout");
                    }}
                  >
                    <LogOut className="size-4" />
                    Sign Out
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      onOpenChange(false);
                      router.push("/login");
                    }}
                  >
                    <LogIn className="size-4" />
                    Sign In with AWS Builder ID
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {view === "surveys" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="card-tactile border-primary bg-primary/10 p-4">
              <p className="font-heading text-sm font-black">
                Architecture Gap Quest ({reflections.length * 50} XP)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Rate any session 3★ or higher to mark the repository architecture gaps it covers as
                addressed. You have rated <strong>{reflections.length}</strong> session(s) and closed{" "}
                <strong>{closedGapsCount}</strong> gap target(s).
              </p>
            </div>

            {lastScan?.schedule?.days ? (
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  Prescribed Sessions from {lastScan.fingerprint.repo.owner}/
                  {lastScan.fingerprint.repo.repo}
                </h4>
                {lastScan.schedule.days
                  .flatMap((d) => d.items)
                  .filter((item) => item.action !== "personal-time")
                  .map((item) => {
                    const saved = reflections.find((r) => r.sessionId === item.sessionId);
                    return (
                      <div key={`${item.sessionId}-${item.start}`} className="card-tactile space-y-2 p-3.5">
                        <p className="text-sm font-extrabold">{item.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
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
                                toast.success(`+50 XP! Rated ${n}/5 ★`);
                              }}
                              className="p-1"
                            >
                              <Star
                                className={`size-5 ${
                                  (saved?.rating ?? 0) >= n
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/30"
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
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  Completed Session Surveys
                </h4>
                {reflections.map((r) => (
                  <div key={r.sessionId} className="card-tactile p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">{r.title}</span>
                      <span className="font-mono text-amber-500">{"★".repeat(r.rating)}</span>
                    </div>
                    {r.note ? <p className="mt-1 text-muted-foreground">{r.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tap any session in the Catalog or Home recommendations to rate it and earn Quest XP.
              </p>
            )}
          </div>
        ) : null}

        {view === "profile" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
            <div className="card-tactile space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="font-extrabold">AWS Builder ID (OAuth 2.0 PKCE)</span>
                <Badge variant={signedIn ? "default" : "secondary"}>
                  {signedIn ? "Connected" : "Signed Out"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {signedIn
                  ? `Active OAuth token for event reinvent2026 (${
                      expiresIn ? `expires in ${Math.round(expiresIn / 60)} min` : "valid"
                    }).`
                  : "Sign in on the Login page to start the loopback PKCE listener on port 8484."}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  router.push(signedIn ? "/logout" : "/login");
                }}
              >
                {signedIn ? "Manage / Sign Out" : "Go to Login Screen"}
              </Button>
            </div>

            <div className="card-tactile space-y-2 p-4">
              <p className="font-extrabold">MCP & WebMCP Endpoints</p>
              <p className="font-mono text-xs text-muted-foreground">
                Remote MCP: https://api.awsevents.com/mcp
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                REST Base: https://api.awsevents.com/v1
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Browser WebMCP: navigator.modelContext / window.webMcp
              </p>
            </div>
          </div>
        ) : null}

        {view === "badge" ? (
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-center">
            <div className="card-tactile mx-auto max-w-xs space-y-3 p-6">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                AWS re:Invent 2026 • Las Vegas
              </p>
              <div className="mx-auto flex size-48 items-center justify-center rounded-2xl border-2 border-border bg-white p-3 shadow-tactile-sm">
                <QrCodeSvg value="https://reinvent.awsevents.com/badge/REINVENT-2026-PKCE" size={168} />
              </div>
              <p className="font-mono text-sm font-black">ATTENDEE • REINVENT-2026-PKCE</p>
              <p className="text-xs text-muted-foreground">
                Present this code with a government-issued photo ID at any campus badge pickup desk.
              </p>
            </div>

            <div className="card-tactile space-y-2 p-4 text-left text-xs text-muted-foreground">
              <p className="font-extrabold text-foreground">Badge Pickup Locations</p>
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
              <div key={item.q} className="card-tactile space-y-1.5 p-4">
                <p className="text-sm font-extrabold">{item.q}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        ) : null}

        {view === "sponsors" ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {SPONSORS.map((s) => (
              <div key={s.name} className="card-tactile flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-extrabold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.tier} Sponsor • {s.booth}
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono">
                  {s.parties} parties
                </Badge>
              </div>
            ))}
          </div>
        ) : null}

        {view === "events" ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            <p className="text-xs text-muted-foreground">
              Loaded from `ListEvents` & `GetEvent` on `https://api.awsevents.com/v1`:
            </p>
            {eventsList.map((ev) => (
              <div key={ev.eventId} className="card-tactile p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold">{ev.name}</p>
                  <Badge>Active</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  ID: {ev.eventId} • {ev.city ?? "Las Vegas, NV"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {String(ev.startDate).slice(0, 10)} → {String(ev.endDate).slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {view === "disclosures" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs leading-relaxed text-muted-foreground">
            <div className="card-tactile space-y-2 p-4">
              <p className="text-sm font-extrabold text-foreground">
                repo:Invent — AWS re:Invent 2026 Hackathon
              </p>
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
              className="w-full"
            >
              Open Printable Remediation & Schedule Report
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
