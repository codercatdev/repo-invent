import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  addPersonalTime,
  favoriteSession,
  mySchedule,
  REMOTE_MCP_URL,
  RemoteMcpBridge,
  reserveSession,
  scanForWeb,
  servedCatalog,
  sessionStatus,
  whatCanIMake,
} from "@/lib/engine";
import type { Party, ReinventSession } from "@/lib/types";

export const runtime = "nodejs";

const MAX_MCP_BYTES = 256 * 1024;

const REMOTE_TOOL_SPECS = [
  {
    name: "AWSEventsPublicApi-Mcp-prod___ListEvents",
    shortName: "ListEvents",
    transport: "aws-mcp" as const,
    description: "Lists AWS events (e.g. reinvent2026) from https://api.awsevents.com/mcp",
    defaultArgs: { includePastEvents: false },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___GetEvent",
    shortName: "GetEvent",
    transport: "aws-mcp" as const,
    description: "Gets event metadata, dates, venue city, and timezone for reinvent2026",
    defaultArgs: { eventId: "reinvent2026" },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___ListSessions",
    shortName: "ListSessions",
    transport: "aws-mcp" as const,
    description: "Lists catalog sessions from the AWS Events MCP server",
    defaultArgs: { eventId: "reinvent2026", includeAbstracts: false },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___GetSession",
    shortName: "GetSession",
    transport: "aws-mcp" as const,
    description: "Gets full session details including abstract, speakers, room, and level",
    defaultArgs: { eventId: "reinvent2026", sessionId: "1791492157127001UCdR" },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___GetSchedule",
    shortName: "GetSchedule",
    transport: "aws-mcp" as const,
    description: "Reads the caller's live reservations, favorites, and personal time blocks",
    defaultArgs: { eventId: "reinvent2026" },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___AssociateFavorites",
    shortName: "AssociateFavorites",
    transport: "aws-mcp" as const,
    description: "Adds up to 10 sessionIds to the caller's favorites list",
    defaultArgs: { eventId: "reinvent2026", sessionIds: ["1791492157127001UCdR"] },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___DisassociateFavorite",
    shortName: "DisassociateFavorite",
    transport: "aws-mcp" as const,
    description: "Removes a sessionId from the caller's favorites list",
    defaultArgs: { eventId: "reinvent2026", sessionId: "1791492157127001UCdR" },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___ReserveSessions",
    shortName: "ReserveSessions",
    transport: "aws-mcp" as const,
    description: "Attempts to reserve seats for up to 10 sessionIds (verifies per-id outcome)",
    defaultArgs: { eventId: "reinvent2026", sessionIds: ["1780442274284001c7uQ"] },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___CancelReservation",
    shortName: "CancelReservation",
    transport: "aws-mcp" as const,
    description: "Cancels a held seat reservation for a sessionId",
    defaultArgs: { eventId: "reinvent2026", sessionId: "1780442274284001c7uQ" },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___CreatePersonalTime",
    shortName: "CreatePersonalTime",
    transport: "aws-mcp" as const,
    description: "Creates a personal time block on the attendee's re:Invent calendar",
    defaultArgs: {
      eventId: "reinvent2026",
      title: "Venetian Walk & Coffee",
      description: "Transit buffer",
      startDateTime: "2026-12-01T14:00:00",
      endDateTime: "2026-12-01T14:30:00",
      location: "The Venetian",
    },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___UpdatePersonalTime",
    shortName: "UpdatePersonalTime",
    transport: "aws-mcp" as const,
    description: "Updates an existing personal time block on the attendee's calendar",
    defaultArgs: {
      eventId: "reinvent2026",
      personalTimeId: "replace-with-id",
      title: "Updated block",
      description: "Updated via MCP",
      startDateTime: "2026-12-01T14:00:00",
      endDateTime: "2026-12-01T15:00:00",
    },
  },
  {
    name: "AWSEventsPublicApi-Mcp-prod___DeletePersonalTime",
    shortName: "DeletePersonalTime",
    transport: "aws-mcp" as const,
    description: "Deletes a personal time block by personalTimeId",
    defaultArgs: { eventId: "reinvent2026", personalTimeId: "replace-with-id" },
  },
];

const LOCAL_TOOL_SPECS = [
  {
    name: "repo_invent___scan_repository",
    shortName: "scan_repository",
    transport: "local-mcp" as const,
    description: "Scans a GitHub repo for AWS architecture gaps, 5-day walkable plan, and tickets",
    defaultArgs: { repo: "sample://reinvent-demo-shop" },
  },
  {
    name: "repo_invent___search_sessions",
    shortName: "search_sessions",
    transport: "local-mcp" as const,
    description: "Searches the 2,279-session catalog by keyword, level, venue, type, or reservability",
    defaultArgs: { query: "Bedrock AgentCore", level: 300, reservableOnly: false },
  },
  {
    name: "repo_invent___search_parties",
    shortName: "search_parties",
    transport: "local-mcp" as const,
    description: "Searches 171 re:Invent 2026 vendor & community parties from conferenceparties.com",
    defaultArgs: { query: "Venetian", day: "" },
  },
  {
    name: "repo_invent___what_can_i_make",
    shortName: "what_can_i_make",
    transport: "local-mcp" as const,
    description: "Checks which sessions can be reached in time from a current venue and clock time",
    defaultArgs: { currentVenue: "The Venetian", afterTime: "2026-11-30T10:00:00" },
  },
];

async function loadPartiesList(): Promise<Party[]> {
  const raw = await readFile(/*turbopackIgnore: true*/ join(process.cwd(), "data", "parties.json"), "utf8");
  const parsed = JSON.parse(raw) as { parties?: Party[] };
  return parsed.parties ?? [];
}

export async function GET() {
  const status = await sessionStatus();
  let liveToolsCount = 0;
  if (status.signedIn) {
    try {
      const remote = await new RemoteMcpBridge().listTools();
      liveToolsCount = remote.length;
    } catch {
      liveToolsCount = 0;
    }
  }
  return NextResponse.json({
    endpoint: REMOTE_MCP_URL,
    clientId: "7vmom55m1qstvq8i71ph127bfq",
    callbackPort: 8484,
    signedIn: status.signedIn,
    expiresInSeconds: status.expiresInSeconds,
    liveRemoteVerified: liveToolsCount > 0,
    remoteToolsCount: REMOTE_TOOL_SPECS.length,
    localToolsCount: LOCAL_TOOL_SPECS.length,
    tools: [...REMOTE_TOOL_SPECS, ...LOCAL_TOOL_SPECS],
  });
}

export async function POST(request: Request) {
  let body: { tool?: unknown; args?: unknown; prompt?: unknown };
  try {
    body = (await request.json()) as { tool?: unknown; args?: unknown; prompt?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (typeof body.prompt === "string" && body.prompt.trim().length > 0) {
    return handleAgentPrompt(body.prompt.trim());
  }

  if (typeof body.tool === "string" && body.tool.length > 0) {
    const args =
      body.args !== null && typeof body.args === "object"
        ? (body.args as Record<string, unknown>)
        : {};
    return handleDirectToolCall(body.tool, args);
  }

  return NextResponse.json({ error: "Provide either `prompt` or `tool`." }, { status: 400 });
}

async function handleDirectToolCall(tool: string, args: Record<string, unknown>) {
  const started = Date.now();
  try {
    if (tool === "repo_invent___scan_repository" || tool === "scan_repository") {
      const repo = typeof args["repo"] === "string" ? args["repo"] : "sample://reinvent-demo-shop";
      const scan = await scanForWeb(repo);
      return NextResponse.json({
        tool,
        transport: "local-mcp",
        isError: false,
        durationMs: Date.now() - started,
        result: {
          repo: `${scan.fingerprint.repo.owner}/${scan.fingerprint.repo.repo}`,
          snapshotSource: scan.snapshotSource,
          services: scan.fingerprint.services.map((s) => s.service),
          gapsCount: scan.gaps.length,
          gaps: scan.gaps,
          daysPlanned: scan.schedule.days.length,
          ticketsCount: scan.plan.remediation.tickets.length,
        },
      });
    }

    if (tool === "repo_invent___search_sessions" || tool === "search_sessions") {
      const catalog = await servedCatalog();
      const q = typeof args["query"] === "string" ? args["query"].toLowerCase().trim() : "";
      const level = typeof args["level"] === "number" ? args["level"] : undefined;
      const reservableOnly = args["reservableOnly"] === true;
      const matches = catalog.sessions
        .filter((s) => {
          if (reservableOnly && !s.availability?.reservable) return false;
          if (level !== undefined && Number(s.level) !== level) return false;
          if (!q) return true;
          const hay = [s.title, s.venue, s.type, s.code ?? "", ...(s.services ?? []), ...(s.topics ?? [])]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 12);
      return NextResponse.json({
        tool,
        transport: "local-mcp",
        isError: false,
        durationMs: Date.now() - started,
        result: {
          catalogSource: catalog.source,
          totalCatalog: catalog.sessions.length,
          returned: matches.length,
          sessions: matches,
        },
      });
    }

    if (tool === "repo_invent___search_parties" || tool === "search_parties") {
      const parties = await loadPartiesList();
      const q = typeof args["query"] === "string" ? args["query"].toLowerCase().trim() : "";
      const day = typeof args["day"] === "string" ? args["day"].toLowerCase().trim() : "";
      const matches = parties
        .filter((p) => {
          if (day && !p.day.toLowerCase().includes(day) && !p.date.includes(day)) return false;
          if (!q) return true;
          const hay = [p.title, p.venue, p.location, ...(p.sponsors ?? [])].join(" ").toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 15);
      return NextResponse.json({
        tool,
        transport: "local-mcp",
        isError: false,
        durationMs: Date.now() - started,
        result: {
          totalParties: parties.length,
          returned: matches.length,
          parties: matches,
        },
      });
    }

    if (tool === "repo_invent___what_can_i_make" || tool === "what_can_i_make") {
      const catalog = await servedCatalog();
      const currentVenue = typeof args["currentVenue"] === "string" ? args["currentVenue"] : "The Venetian";
      const afterTime = typeof args["afterTime"] === "string" ? args["afterTime"] : "2026-11-30T10:00:00";
      const report = whatCanIMake(
        {
          sessions: catalog.sessions,
          eventId: "reinvent2026",
          fetchedAt: catalog.fetchedAt,
          source: catalog.source === "fixture" ? "fixture" : "live",
        },
        { venue: currentVenue, at: afterTime, limit: 10 },
      );
      return NextResponse.json({
        tool,
        transport: "local-mcp",
        isError: false,
        durationMs: Date.now() - started,
        result: {
          currentVenue,
          afterTime,
          reachableCount: report.reachable.length,
          reachable: report.reachable,
        },
      });
    }

    // Remote AWS Events MCP call
    const bridge = new RemoteMcpBridge();
    const result = await bridge.callTool(tool, args);
    const text = JSON.stringify(result.content ?? []);
    if (text.length > MAX_MCP_BYTES) {
      return NextResponse.json(
        {
          tool,
          transport: "aws-mcp",
          isError: true,
          durationMs: Date.now() - started,
          error: "Payload exceeds 256 KB route cap. Pass includeAbstracts: false or page with nextToken.",
          bytes: text.length,
        },
        { status: 413 },
      );
    }
    const bodyText = result.content.map((part) => (part as { text?: string }).text ?? "").join("");
    const failure =
      /"httpStatus"\s*:\s*(4\d\d|5\d\d)/u.test(bodyText) ||
      /"failed"\s*:\s*\[\s*\{/u.test(bodyText);
    let parsedContent: unknown = result.content;
    try {
      parsedContent = JSON.parse(bodyText);
    } catch {
      // keep raw content array
    }
    return NextResponse.json(
      {
        tool,
        transport: "aws-mcp",
        isError: result.isError || failure,
        failure,
        durationMs: Date.now() - started,
        result: parsedContent,
      },
      { status: result.isError || failure ? 422 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP tool call failed";
    const unauthorized = /not signed in|no_tokens|sign in again/i.test(message);
    return NextResponse.json(
      {
        tool,
        transport: "aws-mcp",
        isError: true,
        durationMs: Date.now() - started,
        error: unauthorized
          ? "Not signed in to AWS Builder ID. Run `pnpm cli login` in a terminal to enable live remote MCP writes."
          : message,
      },
      { status: unauthorized ? 401 : 502 },
    );
  }
}

async function handleAgentPrompt(prompt: string) {
  const started = Date.now();
  const lower = prompt.toLowerCase();
  const toolCalls: Array<{
    tool: string;
    transport: "aws-mcp" | "local-mcp";
    args: Record<string, unknown>;
    status: "ok" | "error";
    durationMs: number;
    preview: string;
  }> = [];

  // 1. Check if the user pasted a GitHub repo or asked to scan a repo
  const repoMatch =
    /(https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+|sample:\/\/reinvent-demo-shop)/i.exec(prompt);
  if (repoMatch !== null || /\b(scan|repo|repository|gaps?|architecture)\b/i.test(lower)) {
    const targetRepo = repoMatch ? repoMatch[1] : "sample://reinvent-demo-shop";
    const t0 = Date.now();
    try {
      const scan = await scanForWeb(targetRepo);
      const totalPlanned = scan.schedule.days.reduce((acc, d) => acc + d.items.length, 0);
      toolCalls.push({
        tool: "repo_invent___scan_repository",
        transport: "local-mcp",
        args: { repo: targetRepo },
        status: "ok",
        durationMs: Date.now() - t0,
        preview: `${scan.gaps.length} architectural gaps, ${totalPlanned} sessions planned across ${scan.schedule.days.length} days, ${scan.plan.remediation.tickets.length} tickets`,
      });
      return NextResponse.json({
        reply: `Scanned **${scan.fingerprint.repo.owner}/${scan.fingerprint.repo.repo}** (${scan.snapshotSource}). Found **${scan.gaps.length} architecture gaps** (${scan.gaps.map((g) => g.title).join("; ")}) and prescribed **${totalPlanned} walkable sessions** plus **${scan.plan.remediation.tickets.length} remediation tickets**.`,
        toolCalls,
        scan,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Scan failed";
      toolCalls.push({
        tool: "repo_invent___scan_repository",
        transport: "local-mcp",
        args: { repo: targetRepo },
        status: "error",
        durationMs: Date.now() - t0,
        preview: msg,
      });
    }
  }

  // 2. Check if user is asking about their schedule / reservations / favorites
  if (/\b(my schedule|my calendar|my reservations?|my favorites?|what did i book|what have i saved)\b/i.test(lower)) {
    const t0 = Date.now();
    try {
      const sched = await mySchedule();
      toolCalls.push({
        tool: "AWSEventsPublicApi-Mcp-prod___GetSchedule",
        transport: "aws-mcp",
        args: { eventId: "reinvent2026" },
        status: "ok",
        durationMs: Date.now() - t0,
        preview: `${sched.counts.reservations} reserved, ${sched.counts.favorites} favorites, ${sched.counts.personalTime} personal blocks`,
      });
      const favTitles = sched.favorites
        .slice(0, 5)
        .map((f) => String(f["title"] ?? f["sessionId"]))
        .join(" • ");
      return NextResponse.json({
        reply: `Your live AWS re:Invent 2026 schedule has **${sched.counts.reservations} reserved seats**, **${sched.counts.favorites} favorite sessions**, and **${sched.counts.personalTime} personal time blocks**.${favTitles ? ` Saved: ${favTitles}` : ""}`,
        toolCalls,
        schedule: sched,
        durationMs: Date.now() - started,
      });
    } catch {
      toolCalls.push({
        tool: "AWSEventsPublicApi-Mcp-prod___GetSchedule",
        transport: "aws-mcp",
        args: { eventId: "reinvent2026" },
        status: "error",
        durationMs: Date.now() - t0,
        preview: "Not signed in to Builder ID (401)",
      });
      return NextResponse.json({
        reply:
          "Tried calling `AWSEventsPublicApi-Mcp-prod___GetSchedule` on `https://api.awsevents.com/mcp`, which requires an active AWS Builder ID token. Run `pnpm cli login` in your terminal to sign in via PKCE on port 8484.",
        toolCalls,
        durationMs: Date.now() - started,
      });
    }
  }

  // 3. Check if user is asking about parties / nightlife / networking / drinks / dinner
  if (/\b(part(y|ies)|afterhours|drinks|dinner|happy hour|networking|replay|night|club|sushisamba|venetian party)\b/i.test(lower)) {
    const t0 = Date.now();
    const parties = await loadPartiesList();
    const dayMatch = /\b(sunday|monday|tuesday|wednesday|thursday|friday)\b/i.exec(lower);
    const dayFilter = dayMatch ? dayMatch[1].toLowerCase() : "";
    const stop = new Set([
      "what", "which", "where", "when", "are", "the", "best", "good", "parties", "party",
      "on", "at", "in", "for", "tonight", "night", "afterhours", "networking", "show", "me",
      "find", "any", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday",
    ]);
    const terms = lower
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w));

    const matched = parties
      .filter((p) => {
        if (dayFilter && p.day.toLowerCase() !== dayFilter) return false;
        if (terms.length === 0) return true;
        const hay = [p.title, p.venue, p.location, ...(p.sponsors ?? [])].join(" ").toLowerCase();
        return terms.some((t) => hay.includes(t));
      })
      .slice(0, 6);

    toolCalls.push({
      tool: "repo_invent___search_parties",
      transport: "local-mcp",
      args: { query: terms.join(" "), day: dayFilter || "all" },
      status: "ok",
      durationMs: Date.now() - t0,
      preview: `Matched ${matched.length} of ${parties.length} parties from conferenceparties.com`,
    });

    return NextResponse.json({
      reply:
        matched.length > 0
          ? `Found **${matched.length} parties**${dayFilter ? ` on ${dayFilter}` : ""} from our 171-event conferenceparties.com guide:`
          : `No exact party match for "${terms.join(" ")}", showing top community parties instead:`,
      toolCalls,
      parties: matched.length > 0 ? matched : parties.slice(0, 5),
      durationMs: Date.now() - started,
    });
  }

  // 4. Default: Search the 2,279-session catalog (and check open seats / walk-up / venue / level)
  const t0 = Date.now();
  const catalog = await servedCatalog();
  const openOnly = /\b(open seat|reservable|available|few seats)\b/i.test(lower);
  const walkupOnly = /\b(walk-?up)\b/i.test(lower);
  const keynoteOnly = /\b(keynote)\b/i.test(lower);
  const levelMatch = /\b([12345]00)\b/.exec(lower);
  const targetLevel = levelMatch ? Number(levelMatch[1]) : undefined;

  const filler = new Set([
    "what", "which", "where", "when", "who", "how", "is", "are", "the", "a", "an",
    "about", "for", "of", "to", "in", "on", "at", "do", "does", "can", "i", "we",
    "should", "take", "attend", "session", "sessions", "talk", "talks", "class",
    "tell", "me", "show", "find", "any", "there", "with", "and", "or", "my",
    "open", "seats", "seat", "reservable", "available", "recommend", "recommended",
    "plan", "day", "week", "reinvent", "aws",
  ]);
  const words = lower
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !filler.has(w));

  const scored: Array<{ session: ReinventSession; score: number }> = [];
  for (const session of catalog.sessions) {
    if (openOnly && !session.availability?.reservable) continue;
    if (walkupOnly && session.availability?.reservable !== false) continue;
    if (keynoteOnly && !/keynote/i.test(String(session.type))) continue;
    if (targetLevel !== undefined && Number(session.level) !== targetLevel) continue;

    if (words.length === 0) {
      scored.push({ session, score: session.availability?.reservable ? 2 : 1 });
      continue;
    }

    const title = String(session.title ?? "").toLowerCase();
    const meta = [
      session.venue ?? "",
      session.type ?? "",
      session.code ?? "",
      ...(session.services ?? []),
      ...(session.topics ?? []),
      ...(session.speakers ?? []),
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 4;
      if (meta.includes(w)) score += 2;
    }
    if (score > 0) scored.push({ session, score });
  }

  scored.sort((a, b) => b.score - a.score || String(a.session.start).localeCompare(String(b.session.start)));
  const topSessions = scored.slice(0, 6).map((s) => s.session);

  toolCalls.push({
    tool: "AWSEventsPublicApi-Mcp-prod___ListSessions",
    transport: catalog.source === "live" ? "aws-mcp" : "local-mcp",
    args: {
      eventId: "reinvent2026",
      query: words.join(" ") || "recommended",
      reservableOnly: openOnly,
      ...(targetLevel ? { level: targetLevel } : {}),
    },
    status: "ok",
    durationMs: Date.now() - t0,
    preview: `Searched ${catalog.sessions.length} sessions (${catalog.source}); ${scored.length} matched`,
  });

  // Also support quick actions like "favorite first" or "reserve" if requested
  if (/\b(favorite|save)\b/i.test(lower) && topSessions[0]) {
    const tFav = Date.now();
    try {
      const favRes = await favoriteSession(topSessions[0].sessionId);
      toolCalls.push({
        tool: "AWSEventsPublicApi-Mcp-prod___AssociateFavorites",
        transport: "aws-mcp",
        args: { eventId: "reinvent2026", sessionIds: [topSessions[0].sessionId] },
        status: favRes.saved ? "ok" : "error",
        durationMs: Date.now() - tFav,
        preview: favRes.saved ? `Verified ${topSessions[0].sessionId} on GetSchedule` : (favRes.reason ?? "refused"),
      });
    } catch {
      // ignore if signed out
    }
  }

  if (/\b(reserve|book)\b/i.test(lower) && topSessions[0]) {
    const tRes = Date.now();
    try {
      const resOut = await reserveSession(topSessions[0].sessionId);
      toolCalls.push({
        tool: "AWSEventsPublicApi-Mcp-prod___ReserveSessions",
        transport: "aws-mcp",
        args: { eventId: "reinvent2026", sessionIds: [topSessions[0].sessionId] },
        status: resOut.reserved ? "ok" : "error",
        durationMs: Date.now() - tRes,
        preview: resOut.reserved ? `Held ${topSessions[0].sessionId}` : (resOut.reason ?? "sessionFull"),
      });
    } catch {
      // ignore if signed out
    }
  }

  if (/\b(block time|personal time)\b/i.test(lower)) {
    const tPt = Date.now();
    try {
      const ptOut = await addPersonalTime({
        title: "MCP Personal Block",
        start: "2026-12-01T14:00:00",
        end: "2026-12-01T14:30:00",
        location: "The Venetian",
      });
      toolCalls.push({
        tool: "AWSEventsPublicApi-Mcp-prod___CreatePersonalTime",
        transport: "aws-mcp",
        args: {
          eventId: "reinvent2026",
          title: "MCP Personal Block",
          startDateTime: "2026-12-01T14:00:00",
          endDateTime: "2026-12-01T14:30:00",
        },
        status: ptOut.ok ? "ok" : "error",
        durationMs: Date.now() - tPt,
        preview: ptOut.ok ? `Created personalTimeId ${ptOut.id}` : (ptOut.reason ?? "failed"),
      });
    } catch {
      // ignore if signed out
    }
  }

  return NextResponse.json({
    reply:
      topSessions.length > 0
        ? `Found **${scored.length} sessions** across the ${catalog.sessions.length.toLocaleString()}-session catalog (${catalog.source}). Showing the top ${topSessions.length}:`
        : `No sessions matched "${words.join(" ")}". Try asking about Bedrock, AgentCore, DynamoDB, EKS, Serverless, Keynotes, or paste a GitHub repository URL.`,
    toolCalls,
    sessions: topSessions,
    durationMs: Date.now() - started,
  });
}
