import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface TransitPair {
  from: string;
  to: string;
  minutes: number;
  mode: "walk" | "shuttle" | "rideshare";
  note?: string;
}

export interface TransitMatrix {
  venues: string[];
  defaultBufferMinutes: number;
  unknownPairMinutes: number;
  pairs: TransitPair[];
}

export interface TransitLeg {
  from: string;
  to: string;
  minutes: number;
  mode: "walk" | "shuttle" | "rideshare";
  note?: string;
}

export interface TravelCheck {
  fromTitle: string;
  toTitle: string;
  gapMinutes: number;
  requiredMinutes: number;
  ok: boolean;
  leg: TransitLeg;
  forfeitureRisk: boolean;
}

let cached: VenueTransit | undefined;

function dataDir(): string {
  const here = import.meta.url.startsWith("file:")
    ? import.meta.url
    : new URL(`file://${import.meta.url}`).toString();
  const moduleDir = dirname(fileURLToPath(here));
  // src/solver -> ../../data when running from source; dist/solver -> ../../data
  // when built, so the same relative walk reaches the bundled data folder.
  return join(moduleDir, "..", "..", "data");
}

function normalizeVenue(value: string): string {
  const lowered = value.trim().toLowerCase();
  if (lowered.includes("venetian")) return "The Venetian";
  if (lowered.includes("wynn") || lowered.includes("encore")) return "Wynn | Encore";
  if (lowered.includes("caesars forum") || lowered.includes("forum")) return "Caesars Forum";
  if (lowered.includes("caesars palace")) return "Caesars Palace";
  if (lowered.includes("mgm")) return "MGM Grand";
  if (lowered.includes("mandalay")) return "Mandalay Bay";
  return value.trim();
}

/**
 * The 10-minute seat-forfeiture rule plus the walk between venues.
 *
 * A reserved seat is released 10 minutes before a session starts, so the real
 * requirement is travel time plus ten minutes of headroom, not travel alone.
 */
export const FORFEITURE_MINUTES = 10;

export class VenueTransit {
  private readonly byKey = new Map<string, TransitPair>();

  constructor(private readonly matrix: TransitMatrix) {
    for (const pair of matrix.pairs) {
      this.byKey.set(`${normalizeVenue(pair.from)}->${normalizeVenue(pair.to)}`, pair);
    }
  }

  static load(path?: string): VenueTransit {
    if (cached !== undefined && path === undefined) return cached;
    const target = path ?? join(dataDir(), "venues-transit.json");
    const parsed = JSON.parse(readFileSync(target, "utf8")) as TransitMatrix;
    const instance = new VenueTransit(parsed);
    if (path === undefined) cached = instance;
    return instance;
  }

  get venues(): string[] {
    return this.matrix.venues;
  }

  get bufferMinutes(): number {
    return this.matrix.defaultBufferMinutes;
  }

  legBetween(from: string, to: string): TransitLeg {
    const origin = normalizeVenue(from);
    const destination = normalizeVenue(to);
    const direct = this.byKey.get(`${origin}->${destination}`);
    if (direct) {
      const leg: TransitLeg = {
        from: origin,
        to: destination,
        minutes: direct.minutes,
        mode: direct.mode,
      };
      if (direct.note !== undefined) leg.note = direct.note;
      return leg;
    }
    const reverse = this.byKey.get(`${destination}->${origin}`);
    if (reverse) {
      return { from: origin, to: destination, minutes: reverse.minutes, mode: reverse.mode };
    }
    return {
      from: origin,
      to: destination,
      minutes: this.matrix.unknownPairMinutes,
      mode: "rideshare",
      note: `no known route; a conservative ${this.matrix.unknownPairMinutes} minute estimate is used`,
    };
  }

  /**
   * Check one transition against the forfeiture rule.
   *
   * `gapMinutes` is what the plan actually leaves between the two sessions.
   * `requiredMinutes` is travel plus the ten-minute rule.
   */
  checkTravel(previous: { title: string; venue: string; end: string }, next: { title: string; venue: string; start: string }): TravelCheck {
    const leg = this.legBetween(previous.venue, next.venue);
    const gapMinutes = minutesBetween(previous.end, next.start);
    const requiredMinutes = leg.minutes + FORFEITURE_MINUTES;
    const ok = gapMinutes >= requiredMinutes;
    return {
      fromTitle: previous.title,
      toTitle: next.title,
      gapMinutes,
      requiredMinutes,
      ok,
      leg,
      forfeitureRisk: !ok,
    };
  }
}

export function minutesBetween(endIso: string, startIso: string): number {
  const end = Date.parse(endIso);
  const start = Date.parse(startIso);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 0;
  return Math.round((start - end) / 60_000);
}

/** Convenience for callers that already have both sides as strings. */
export function checkTravel(
  previous: { title: string; venue: string; end: string },
  next: { title: string; venue: string; start: string },
  matrix: VenueTransit = VenueTransit.load(),
): TravelCheck {
  return matrix.checkTravel(previous, next);
}
