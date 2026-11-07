import type { Catalog, ReinventSession } from "../types";
import { VenueTransit } from "./transit-guard";

export interface Candidate {
  session: ReinventSession;
  /** Minutes from now until the session starts. */
  gapMinutes: number;
  /** Travel time plus the ten-minute seat rule. */
  requiredMinutes: number;
  travelMinutes: number;
  mode: string;
  feasible: boolean;
}

export interface CandidateReport {
  at: string;
  venue: string;
  /** Feasible only, soonest first. */
  reachable: Candidate[];
  /** Everything still ahead, including what cannot be reached. */
  considered: Candidate[];
}

const FORFEITURE_MINUTES = 10;

// The question is about the rest of one day, so the answer stops at midnight.
const MAX_HORIZON_MINUTES = 12 * 60;

/**
 * "It is Tuesday 12:40 and I am at MGM Grand. What can I still make?"
 *
 * The answer uses the same rules as planning: a reserved seat is lost ten
 * minutes before start, so a talk is reachable only if the walk plus those ten
 * minutes fits in the gap.
 */
export function whatCanIMake(
  catalog: Catalog,
  options: {
    at: string;
    venue: string;
    held?: string[];
    transit?: VenueTransit;
    limit?: number;
  },
): CandidateReport {
  const transit = options.transit ?? VenueTransit.load();
  const held = new Set(options.held ?? []);
  const now = Date.parse(options.at);

  const considered: Candidate[] = [];
  for (const session of catalog.sessions) {
    if (held.has(session.sessionId)) continue;
    const start = Date.parse(session.start);
    if (!Number.isFinite(start) || start <= now) continue;
    const sameDay = session.start.slice(0, 10) === options.at.slice(0, 10);
    if (!sameDay) continue;
    const gapMinutes = Math.round((start - now) / 60_000);
    if (gapMinutes > MAX_HORIZON_MINUTES) continue;
    const leg = transit.legBetween(options.venue, session.venue);
    const requiredMinutes = leg.minutes + FORFEITURE_MINUTES;
    considered.push({
      session,
      gapMinutes,
      requiredMinutes,
      travelMinutes: leg.minutes,
      mode: leg.mode,
      feasible: gapMinutes >= requiredMinutes,
    });
  }

  considered.sort((left, right) => left.gapMinutes - right.gapMinutes);
  const reachable = considered.filter((entry) => entry.feasible);
  return {
    at: options.at,
    venue: options.venue,
    reachable: options.limit ? reachable.slice(0, options.limit) : reachable,
    considered,
  };
}

/** The answer as a short table a terminal can print. */
export function renderCandidates(report: CandidateReport): string {
  const lines = [`At ${report.at.slice(11, 16)} from ${report.venue}:`];
  if (report.reachable.length === 0) {
    lines.push("  Nothing reachable. The next walkable session starts too soon to get there.");
    return lines.join("\n");
  }
  for (const entry of report.reachable.slice(0, 12)) {
    const venue = entry.session.venue.padEnd(16);
    lines.push(
      `  ${entry.session.start.slice(11, 16)}  ${venue}  ${entry.session.title.slice(0, 58)}`,
    );
  }
  if (report.reachable.length > 12) {
    lines.push(`  ... and ${report.reachable.length - 12} more`);
  }
  return lines.join("\n");
}
