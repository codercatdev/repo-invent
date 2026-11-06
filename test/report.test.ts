import { describe, expect, it } from "vitest";
import { renderReportHtml, escapeHtml } from "../src/report.js";
import type { ArchitecturalGap, PrescriptionPlan } from "../src/types.js";

const gap: ArchitecturalGap = {
  id: "dynamodb-without-resilience",
  title: "DynamoDB with no Streams",
  why: "Writes fail and nothing captures them.",
  severity: "high",
  evidence: [{ label: "DynamoDB in package.json", paths: ["package.json"] }],
  taggedServices: ["DynamoDB"],
  searchTopics: ["DynamoDB"],
  targetLevel: 300,
};

const plan: PrescriptionPlan = {
  fingerprint: {
    repo: { owner: "acme", repo: "shop" },
    scannedAt: "2026-11-06T00:00:00.000Z",
    languages: {},
    services: [],
    frameworks: [],
    compute: ["lambda"],
    iac: ["terraform"],
    hasMcpConfig: false,
    hasDocker: false,
    recommendedLevel: 300,
    warnings: [],
  },
  gaps: [gap],
  schedule: {
    eventId: "reinvent2026",
    repo: { owner: "acme", repo: "shop" },
    fingerprint: {
      repo: { owner: "acme", repo: "shop" },
      scannedAt: "2026-11-06T00:00:00.000Z",
      languages: {},
      services: [],
      frameworks: [],
      compute: ["lambda"],
      iac: ["terraform"],
      hasMcpConfig: false,
      hasDocker: false,
      recommendedLevel: 300,
      warnings: [],
    },
    gaps: [gap],
    days: [
      {
        date: "2026-12-01",
        items: [
          {
            action: "reserve",
            sessionId: "a",
            title: "DynamoDB Deep Dive",
            start: "2026-12-01T09:00:00",
            end: "2026-12-01T10:00:00",
            venue: "The Venetian",
            gaps: [gap.id],
          },
        ],
        transit: [],
      },
    ],
    personalTime: [],
    warnings: [],
  },
  remediation: {
    tickets: [
      {
        id: "RI-01",
        gapId: gap.id,
        title: gap.title,
        why: gap.why,
        effort: "M",
        acceptanceTest: "A failed write is captured by a DLQ and parked, not lost.",
        sessionIds: ["a"],
        docLinks: [],
      },
    ],
    generatedAt: "2026-11-06T00:00:00.000Z",
  },
};

describe("report", () => {
  it("renders a self-contained page with no scripts", () => {
    const html = renderReportHtml(plan);
    expect(html).toContain("re:Invent 2026 remediation plan for acme/shop");
    expect(html).toContain("RI-01");
    expect(html).toContain("DynamoDB Deep Dive");
    expect(html).toContain("Acceptance test");
    expect(html).not.toContain("<script");
    expect(html).toContain("@media print");
  });

  it("escapes user-controlled text", () => {
    const dirty: PrescriptionPlan = {
      ...plan,
      gaps: [{ ...gap, title: '<img src=x onerror="alert(1)">' }],
    };
    const html = renderReportHtml(dirty);
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });

  it("escapes the ampersand first, so nothing double-decodes", () => {
    expect(escapeHtml("<a & b>")).toBe("&lt;a &amp; b&gt;");
  });

  it("renders an empty plan without throwing", () => {
    const empty: PrescriptionPlan = {
      ...plan,
      gaps: [],
      schedule: { ...plan.schedule, days: [] },
      remediation: { ...plan.remediation, tickets: [] },
    };
    const html = renderReportHtml(empty);
    expect(html).toContain("No gaps were found");
    expect(html).toContain("Nothing scheduled");
  });
});
