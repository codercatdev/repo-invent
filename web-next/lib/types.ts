/**
 * The shapes the UI draws.
 *
 * These are deliberately local: the engine's types are accurate but wide, and a
 * screen only needs the fields it renders. Keeping them here means a change to
 * the engine's internals does not ripple through components.
 */
import type { ArchitecturalGap, ReinventSession, StackFingerprint } from "./engine";

export type { ArchitecturalGap, ReinventSession, StackFingerprint };

export type Severity = "high" | "medium" | "low";

/** One session the planner put on a day. */
export interface PlanItem {
  action: string;
  sessionId: string;
  title: string;
  start: string;
  end: string;
  venue: string;
  gaps: string[];
  level: number | string;
  note?: string;
}

/** A walk between two venues, with the seat-forfeiture rule already applied. */
export interface TransitLeg {
  fromTitle: string;
  toTitle: string;
  gapMinutes: number;
  requiredMinutes: number;
  ok: boolean;
  leg?: { from: string; to: string; minutes: number; mode: string };
  forfeitureRisk: boolean;
}

export interface PlanDay {
  date: string;
  items: PlanItem[];
  transit: TransitLeg[];
}

export interface Ticket {
  id: string;
  gapId: string;
  title: string;
  why: string;
  effort: "S" | "M" | "L";
  acceptanceTest: string;
  sessionIds: string[];
}

/** What `/api/scan` answers. */
export interface ScanResult {
  fingerprint: StackFingerprint;
  gaps: ArchitecturalGap[];
  schedule: { days: PlanDay[] };
  plan: { remediation: { tickets: Ticket[] } };
  catalogSource: "live" | "fixture";
  sessions: ReinventSession[];
  snapshotSource: "live" | "cached" | "recorded" | "sample";
}

/** A party scraped from the community calendar. */
export interface Party {
  date: string;
  day: string;
  timeLabel: string;
  start: string | null;
  end: string | null;
  sponsors: string[];
  title: string;
  url: string | null;
  location: string;
  venue: string;
  address: string | null;
  mapUrl: string;
  atCapacity: boolean;
}

/** A saved session or blocked block on the attendee's own calendar. */
export interface CalendarEntry {
  id: string;
  title: string;
  start: string;
  end: string;
  venue: string;
  room?: string;
  kind: "reserved" | "saved" | "blocked";
}

/** The result of a write, after reading the schedule back. */
export interface WriteResult {
  ok: boolean;
  reason?: string;
  id?: string;
}
