import { describe, expect, it } from "vitest";
import { renderCandidates, whatCanIMake } from "../src/solver/candidates.js";
import { VenueTransit } from "../src/solver/transit-guard.js";
import type { Catalog, ReinventSession } from "../src/types.js";

const transit = VenueTransit.load(`${import.meta.dirname}/../data/venues-transit.json`);

function session(id: string, venue: string, start: string, end: string): ReinventSession {
  return {
    sessionId: id,
    title: `Talk ${id}`,
    abstract: "",
    type: "Breakout",
    level: 300,
    venue,
    start,
    end,
    availability: { reservable: true, fullness: "open" },
    tracks: [],
    topics: [],
    services: [],
    speakers: [],
  };
}

const catalog: Catalog = {
  eventId: "reinvent2026",
  fetchedAt: "2026-11-06T00:00:00.000Z",
  source: "fixture",
  sessions: [
    session("soon-far", "Mandalay Bay", "2026-12-01T12:45:00", "2026-12-01T13:45:00"),
    session("later-here", "MGM Grand", "2026-12-01T13:30:00", "2026-12-01T14:30:00"),
    session("held", "MGM Grand", "2026-12-01T14:00:00", "2026-12-01T15:00:00"),
    session("past", "MGM Grand", "2026-12-01T11:00:00", "2026-12-01T12:00:00"),
  ],
};

describe("what can I make", () => {
  it("drops a session that already started", () => {
    const report = whatCanIMake(catalog, {
      at: "2026-12-01T12:40:00",
      venue: "MGM Grand",
      transit,
    });
    expect(report.considered.map((entry) => entry.session.sessionId)).not.toContain("past");
  });

  it("marks a cross-Strip hop as infeasible when the walk does not fit", () => {
    const report = whatCanIMake(catalog, {
      at: "2026-12-01T12:40:00",
      venue: "MGM Grand",
      transit,
    });
    const far = report.considered.find((entry) => entry.session.sessionId === "soon-far");
    expect(far).toBeDefined();
    // 5 minutes' notice cannot cover a cross-campus shuttle plus the seat rule.
    expect(far?.feasible).toBe(false);
  });

  it("keeps a session in the same venue that starts later", () => {
    const report = whatCanIMake(catalog, {
      at: "2026-12-01T12:40:00",
      venue: "MGM Grand",
      transit,
    });
    const here = report.reachable.find((entry) => entry.session.sessionId === "later-here");
    expect(here).toBeDefined();
    expect(here?.requiredMinutes).toBe(transit.legBetween("MGM Grand", "MGM Grand").minutes + 10);
  });

  it("never offers something already held and does not offer the same session twice", () => {
    const report = whatCanIMake(catalog, {
      at: "2026-12-01T12:40:00",
      venue: "MGM Grand",
      held: ["held"],
      transit,
    });
    const ids = report.considered.map((entry) => entry.session.sessionId);
    expect(ids).not.toContain("held");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prints nothing-reachable plainly", () => {
    const report = whatCanIMake({ ...catalog, sessions: [] }, {
      at: "2026-12-01T12:40:00",
      venue: "MGM Grand",
      transit,
    });
    expect(renderCandidates(report)).toContain("Nothing reachable");
  });

  it("sorts the answer soonest first", () => {
    const report = whatCanIMake(catalog, {
      at: "2026-12-01T12:00:00",
      venue: "MGM Grand",
      held: [],
      transit,
    });
    const times = report.reachable.map((entry) => entry.gapMinutes);
    expect([...times].sort((left, right) => left - right)).toEqual(times);
  });
});
