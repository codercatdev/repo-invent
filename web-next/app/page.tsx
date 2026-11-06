"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionCard } from "@/components/session-card";
import { SessionSheet } from "@/components/session-sheet";
import type { PlanDay, ReinventSession, ScanResult, Ticket } from "@/lib/types";

/**
 * Home.
 *
 * Two things, in this order: the Ask box, then the repository check directly
 * under it. That order is the point of the product — you ask about the
 * conference, or you ask what your own code is missing, without leaving the
 * first screen.
 */
const SAMPLE = "sample://reinvent-demo-shop";

/** Words that carry no meaning for a catalog search. */
const FILLER = new Set([
  "what", "which", "where", "when", "who", "how", "is", "are", "the", "a", "an",
  "about", "for", "of", "to", "in", "on", "at", "do", "does", "can", "i", "we",
  "should", "take", "attend", "session", "sessions", "talk", "talks", "class",
  "tell", "me", "show", "find", "any", "there", "with", "and", "or", "my",
]);

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FILLER.has(word));
}

export default function HomePage() {
  const [catalog, setCatalog] = useState<ReinventSession[] | null>(null);
  const [catalogSource, setCatalogSource] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ReinventSession[] | null>(null);
  const [repo, setRepo] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReinventSession | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/catalog")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog"))))
      .then((data: { sessions: ReinventSession[]; source: string }) => {
        if (!live) return;
        setCatalog(data.sessions ?? []);
        setCatalogSource(data.source ?? "");
      })
      .catch(() => {
        if (live) setCatalog([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const nextUp = useMemo(() => {
    if (catalog === null) return [];
    return catalog
      .slice()
      .sort((left, right) => String(left.start).localeCompare(String(right.start)))
      .slice(0, 3);
  }, [catalog]);

  function ask() {
    const words = terms(question);
    if (words.length === 0 || catalog === null) {
      setAnswer([]);
      return;
    }
    const scored = catalog
      .map((session) => {
        const title = String(session.title ?? "").toLowerCase();
        const rest = [...(session.services ?? []), ...(session.topics ?? []), session.code ?? ""]
          .join(" ")
          .toLowerCase();
        let score = 0;
        for (const term of words) {
          if (title.includes(term)) score += 3;
          if (title.startsWith(term)) score += 2;
          if (rest.includes(term)) score += 1;
        }
        return { session, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || String(left.session.start).localeCompare(String(right.session.start)))
      .slice(0, 8)
      .map((entry) => entry.session);
    setAnswer(scored);
    if (scored.length === 0) {
      setRepo(repo);
    }
  }

  async function runScan(target: string) {
    setScanning(true);
    setScan(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: target }),
      });
      const data = (await response.json()) as ScanResult & { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "The scan failed.");
        return;
      }
      setScan(data);
    } catch {
      toast.error("Could not reach the scanner.");
    } finally {
      setScanning(false);
    }
  }

  function openSession(session: ReinventSession) {
    setSelected(session);
    setOpen(true);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          Ask about the week, or check your own code.
        </h1>

        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") ask();
            }}
            placeholder="Ask AWS about re:Invent"
            aria-label="Ask about re:Invent"
          />
          <Button onClick={ask} className="gap-1.5">
            <Search className="size-4" aria-hidden />
            Ask
          </Button>
        </div>

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (repo.trim()) void runScan(repo.trim());
          }}
        >
          <Input
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            placeholder="https://github.com/owner/repository"
            aria-label="Public GitHub repository URL"
            inputMode="url"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={scanning} className="flex-1">
              {scanning ? "Reading the repository…" : "Check my repository"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void runScan(SAMPLE)} disabled={scanning}>
              Sample
            </Button>
          </div>
        </form>
      </section>

      {answer !== null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            {answer.length > 0 ? `${answer.length} sessions match` : "Nothing matches that"}
          </h2>
          {answer.map((session) => (
            <SessionCard key={session.sessionId} session={session} onOpen={openSession} />
          ))}
        </section>
      ) : null}

      {scan !== null ? <ScanReport result={scan} /> : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Next up</h2>
          <span className="text-xs text-muted-foreground">
            {catalog === null ? "" : `${catalog.length} in the catalog`}
            {catalogSource ? ` · ${catalogSource}` : ""}
          </span>
        </div>
        {catalog === null
          ? [0, 1, 2].map((key) => <Skeleton key={key} className="h-[72px] rounded-xl" />)
          : nextUp.map((session) => (
              <SessionCard key={session.sessionId} session={session} onOpen={openSession} />
            ))}
      </section>

      <SessionSheet session={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** The scan result: what is missing, the week, then the tickets. */
function ScanReport({ result }: { result: ScanResult }) {
  const gaps = result.gaps ?? [];
  const days: PlanDay[] = result.schedule?.days ?? [];
  const tickets: Ticket[] = result.plan?.remediation?.tickets ?? [];
  const repo = `${result.fingerprint.repo.owner}/${result.fingerprint.repo.repo}`;

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {repo} · {gaps.length} gap{gaps.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{originOf(result.snapshotSource)}</p>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">What is missing</h2>
        {gaps.length === 0 ? (
          <Card className="bg-card/60 p-4 text-sm text-muted-foreground">
            The files that were read do not support a claim, so this says nothing rather than guessing.
          </Card>
        ) : (
          gaps.map((gap) => (
            <Card key={gap.id} className="gap-1.5 border-border/70 bg-card/60 p-4">
              <Badge
                variant="outline"
                className={
                  gap.severity === "high"
                    ? "w-fit border-red-500/40 text-[10px] text-red-400"
                    : gap.severity === "medium"
                      ? "w-fit border-amber-500/40 text-[10px] text-amber-400"
                      : "w-fit text-[10px]"
                }
              >
                {gap.severity}
              </Badge>
              <p className="text-sm font-medium">{gap.title}</p>
              <p className="text-xs text-muted-foreground">{gap.why}</p>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Your week</h2>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions fit this week.</p>
        ) : (
          days.map((day) => (
            <div key={day.date} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {niceDate(day.date)} · {day.items.length} sessions
              </p>
              {day.items.map((item) => (
                <Card key={`${day.date}-${item.sessionId}-${item.start}`} className="gap-1 border-border/70 bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{String(item.start ?? "").slice(11, 16)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {labelOf(item.action)}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium leading-snug">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.venue} · closes {item.gaps.length} gap{item.gaps.length === 1 ? "" : "s"}
                  </p>
                  {item.note ? <p className="text-xs text-muted-foreground/80">{item.note}</p> : null}
                  <Transit day={day} title={item.title} />
                </Card>
              ))}
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Tickets</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gaps, so no tickets.</p>
        ) : (
          tickets.map((ticket) => (
            <Card key={ticket.id} className="gap-1 border-border/70 bg-card/60 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {ticket.effort} effort
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">{ticket.id}</span>
              </div>
              <p className="text-sm font-medium">{ticket.title}</p>
              <p className="text-xs text-muted-foreground">Acceptance: {ticket.acceptanceTest}</p>
            </Card>
          ))
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Tap a session in the catalog to save it. Saving is checked against your own schedule before
        the app says it worked.
      </p>
    </div>
  );
}

/** The walk between two planned sessions, with the tight case called out. */
function Transit({ day, title }: { day: PlanDay; title: string }) {
  const leg = (day.transit ?? []).find((candidate) => candidate.fromTitle === title);
  if (leg === undefined || leg.leg === undefined) return null;
  const tight = leg.forfeitureRisk || leg.ok === false;
  return (
    <p className={tight ? "text-xs text-red-400" : "text-xs text-muted-foreground"}>
      ↓ {leg.leg.minutes} min {leg.leg.mode} to next {tight ? "· too tight" : ""}
    </p>
  );
}

function labelOf(action: string): string {
  if (action === "reserve") return "reserve";
  if (action === "favorite-walk-up") return "walk-up";
  if (action === "favorite-watchlist") return "watchlist";
  if (action === "personal-time") return "protected";
  return action;
}

function originOf(source: string): string {
  if (source === "live") return "Read live from GitHub.";
  if (source === "cached") return "GitHub is rate-limited, so this is a cached copy.";
  if (source === "recorded") return "GitHub is rate-limited, so this is the recorded copy.";
  return "The bundled sample repository.";
}

function niceDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
