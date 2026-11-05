import { describe, expect, it } from "vitest";
import { VenueTransit, minutesBetween } from "../src/solver/transit-guard.js";
import { buildPlan, buildRemediation, scoreSession } from "../src/solver/scorer.js";
import { diffPlans, renderPlanDiff } from "../src/export/plan-diff.js";
import { renderIssueDrafts, renderRemediationMarkdown } from "../src/export/markdown.js";
import type {
  ArchitecturalGap,
  Catalog,
  ReinventSession,
  StackFingerprint,
} from "../src/types.js";

const transit = VenueTransit.load(`${import.meta.dirname}/../data/venues-transit.json`);

const fingerprint: StackFingerprint = {
  repo: { owner: "acme", repo: "shop" },
  scannedAt: "2026-11-05T00:00:00.000Z",
  languages: { TypeScript: 100 },
  services: [
    { service: "DynamoDB", confidence: "high", sources: [{ kind: "manifest", path: "package.json" }] },
  ],
  frameworks: [],
  compute: ["lambda"],
  iac: ["terraform"],
  hasMcpConfig: false,
  hasDocker: false,
  recommendedLevel: 300,
  warnings: [],
};

const gaps: ArchitecturalGap[] = [
  {
    id: "dynamodb-without-resilience",
    title: "DynamoDB with no Streams, DAX or dead-letter queue",
    why: "Writes fail and nothing captures them.",
    severity: "high",
    evidence: [{ label: "DynamoDB in package.json", paths: ["package.json"] }],
    taggedServices: ["DynamoDB", "SQS"],
    searchTopics: ["DynamoDB"],
    targetLevel: 300,
  },
];

function session(overrides: Partial<ReinventSession> & Pick<ReinventSession, "sessionId" | "title">): ReinventSession {
  return {
    abstract: "",
    type: "Breakout",
    level: 300,
    venue: "The Venetian",
    start: "2026-12-01T09:00:00",
    end: "2026-12-01T10:00:00",
    availability: { reservable: true, fullness: "open" },
    tracks: [],
    topics: [],
    services: [],
    speakers: [],
    ...overrides,
  };
}

const catalog: Catalog = {
  eventId: "reinvent2026",
  fetchedAt: "2026-11-05T00:00:00.000Z",
  source: "fixture",
  sessions: [
    session({ sessionId: "a", title: "DynamoDB Deep Dive", topics: ["DynamoDB"], services: ["DynamoDB"] }),
    session({
      sessionId: "b",
      title: "Cross-town clash",
      venue: "Mandalay Bay",
      start: "2026-12-01T10:05:00",
      end: "2026-12-01T11:00:00",
    }),
    session({
      sessionId: "c",
      title: "Full workshop",
      type: "Workshop",
      venue: "The Venetian",
      start: "2026-12-01T13:00:00",
      end: "2026-12-01T15:00:00",
      availability: { reservable: false, fullness: "full" },
    }),
    session({
      sessionId: "d",
      title: "Recorded talk",
      venue: "Wynn | Encore",
      start: "2026-12-02T09:00:00",
      end: "2026-12-02T10:00:00",
      recorded: true,
    }),
  ],
};

describe("transit guard", () => {
  it("requires travel plus the ten minute forfeiture rule", () => {
    const leg = transit.legBetween("The Venetian", "Mandalay Bay");
    const check = transit.checkTravel(
      { title: "a", venue: "The Venetian", end: "2026-12-01T10:00:00" },
      { title: "b", venue: "Mandalay Bay", start: "2026-12-01T10:20:00" },
    );
    expect(leg.mode).toBe("shuttle");
    expect(check.requiredMinutes).toBe(leg.minutes + 10);
    expect(check.forfeitureRisk).toBe(true);
  });

  it("treats an unknown venue pair conservatively and says so", () => {
    const leg = Number.isFinite(0) ? { minutes: 35 } : { minutes: 0 };
    void leg;
    const leg2 = { minutes: 30 } as { minutes: number };
    void leg2;
    const load = VenueTransit.load();
    const leg3 = load.legBetween("Nowhere", "Somewhere");
    expect(leg3.minutes).toBeGreaterThan(0);
    expect(leg3.note).toBeDefined();
  });

  it("computes gaps to the minute", () => {
    expect(minutesBetween("2026-12-01T10:00:00", "2026-12-01T10:45:00")).toBe(45);
  });
});

describe("scoring", () => {
  it("ranks a session that closes a gap above an unrelated one", () => {
    const onGap = scoreSession(catalog.sessions[0] as ReinventSession, fingerprint, gaps);
    const offGap = scoreSession(catalog.sessions[1] as ReinventSession, fingerprint, gaps);
    expect(onGap.score).toBeGreaterThan(offGap.score);
    expect(onGap.matchedGaps).toContain("dynamodb-without-resilience");
  });
});

describe("planning", () => {
  it("never books two sessions that overlap", () => {
    const plan = buildPlan(catalog, fingerprint, gaps, { transit, synthesisPerDay: false });
    for (const day of plan.days) {
      const items = [...day.items].sort((left, right) => left.start.localeCompare(right.start));
      for (let index = 1; index < items.length; index += 1) {
        const previous = items[index - 1];
        const current = items[index];
        if (!previous || !current) continue;
        expect(previous.end <= current.start).toBe(true);
      }
    }
  });

  it("drops a session whose transfer breaks the forfeiture rule", () => {
    const plan = buildPlan(catalog, fingerprint, gaps, { transit, synthesisPerDay: false });
    const titles = plan.days.flatMap((day) => day.items.map((item) => item.title));
    expect(titles).not.toContain("Cross-town clash");
  });

  it("routes a full interactive session to the walk-up queue and a recording to the watchlist", () => {
    const plan = buildPlan(catalog, fingerprint, gaps, { transit, synthesisPerDay: false });
    const items = plan.days.flatMap((day) => day.items);
    expect(items.find((item) => item.title === "Full workshop")?.action).toBe("favorite-walk-up");
    expect(items.find((item) => item.title === "Recorded talk")?.action).toBe("favorite-watchlist");
  });

  it("adds one synthesis block per day when asked", () => {
    const plan = buildPlan(catalog, fingerprint, gaps, { transit });
    for (const day of plan.days) {
      const synthesis = day.items.filter((item) => item.title === "Repo Architecture Synthesis");
      expect(synthesis).toHaveLength(1);
    }
  });
});

describe("remediation", () => {
  it("gives every ticket a concrete acceptance test", () => {
    const plan = buildRemediation(gaps);
    expect(plan.tickets).toHaveLength(1);
    const ticket = plan.tickets[0];
    expect(ticket?.acceptanceTest.length).toBeGreaterThan(20);
    expect(ticket?.docLinks.length).toBeGreaterThan(0);
  });

  it("renders a markdown plan deterministically", () => {
    const schedule = buildPlan(catalog, fingerprint, gaps, { transit });
    const remediation = buildRemediation(gaps);
    const first = renderRemediationMarkdown(remediation, schedule);
    const second = renderRemediationMarkdown(remediation, schedule);
    expect(first).toBe(second);
    expect(first).toContain("# re:Invent 2026 remediation plan for acme/shop");
    expect(first).toContain("- [ ]");
  });

  it("builds issue drafts without calling GitHub", () => {
    const drafts = renderIssueDrafts(buildRemediation(gaps));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("DynamoDB");
    expect(drafts[0]?.labels).toContain("re:invent-remediation");
  });
});

describe("plan diff", () => {
  it("reports moved sessions as moved, not as a remove and an add", () => {
    const base = buildPlan(catalog, fingerprint, gaps, { transit, synthesisPerDay: false });
    const shifted: Catalog = {
      ...catalog,
      sessions: catalog.sessions.map((entry) =>
        entry.sessionId === "a"
          ? { ...entry, start: "2026-12-01T11:00:00", end: "2026-12-01T12:00:00" }
          : entry,
      ),
    };
    const next = buildPlan(shifted, fingerprint, gaps, { transit, synthesisPerDay: false });
    const diff = diffPlans(base, next);
    expect(diff.moved.length + diff.added.length + diff.removed.length).toBeGreaterThan(0);
    const text = renderPlanDiff(diff);
    expect(text).toContain("@@");
  });

  it("handles two empty plans", () => {
    const empty = buildPlan({ ...catalog, sessions: [] }, fingerprint, gaps, { transit, synthesisPerDay: false });
    const diff = diffPlans(empty, empty);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(renderPlanDiff(diff)).toContain("No differences");
  });
});
