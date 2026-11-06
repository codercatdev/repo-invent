import { describe, expect, it } from "vitest";
import {
  CLOSING_RATING,
  parseReflections,
  progressFrom,
  reflectionsToMarkdown,
} from "../src/reflect.js";
import type { ArchitecturalGap } from "../src/types.js";

function gap(id: string): ArchitecturalGap {
  return {
    id,
    title: `Gap ${id}`,
    why: "because",
    severity: "high",
    evidence: [],
    taggedServices: [],
    searchTopics: [],
    targetLevel: 300,
  };
}

const gaps = [gap("a"), gap("b"), gap("c")];

describe("reflections", () => {
  it("closes a gap only when the session rates at or above the threshold", () => {
    const low = progressFrom(gaps, [
      { sessionId: "s1", title: "t", rating: CLOSING_RATING - 1, note: "", gapIds: ["a"], at: "" },
    ]);
    expect(low.closed).toHaveLength(0);
    expect(low.open).toHaveLength(3);

    const high = progressFrom(gaps, [
      { sessionId: "s1", title: "t", rating: CLOSING_RATING, note: "", gapIds: ["a"], at: "" },
    ]);
    expect(high.closed.map((entry) => entry.id)).toEqual(["a"]);
    expect(high.open.map((entry) => entry.id)).toEqual(["b", "c"]);
  });

  it("counts a gap once when two sessions cover it", () => {
    const progress = progressFrom(gaps, [
      { sessionId: "s1", title: "t1", rating: 5, note: "", gapIds: ["a"], at: "" },
      { sessionId: "s2", title: "t2", rating: 4, note: "", gapIds: ["a", "b"], at: "" },
    ]);
    expect(progress.closed.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(progress.open.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("clamps a rating into 1..5 instead of trusting the browser", () => {
    const parsed = parseReflections([
      { sessionId: "s", title: "t", rating: 99, gapIds: [] },
      { sessionId: "s", title: "t", rating: -4, gapIds: [] },
    ]);
    expect(parsed.map((entry) => entry.rating)).toEqual([5, 1]);
  });

  it("drops malformed entries rather than throwing", () => {
    expect(parseReflections(null)).toEqual([]);
    expect(parseReflections([null, 3, { title: "no id" }, { sessionId: "s" }])).toEqual([]);
  });

  it("says what is still open in one sentence", () => {
    expect(progressFrom(gaps, []).summary).toContain("3 gaps open");
    const progress = progressFrom(gaps, [
      { sessionId: "s", title: "t", rating: 5, note: "", gapIds: ["a"], at: "" },
    ]);
    expect(progress.summary).toContain("1 of 3 gaps closed");
  });

  it("renders a markdown record with the open work last", () => {
    const reflections = [
      { sessionId: "s1", title: "DynamoDB", rating: 5, note: "Streams are the key.", gapIds: ["a"], at: "" },
    ];
    const markdown = reflectionsToMarkdown(reflections, progressFrom(gaps, reflections));
    expect(markdown).toContain("# What I learned at re:Invent 2026");
    expect(markdown).toContain("★★★★★");
    expect(markdown).toContain("## Still open");
    expect(markdown).toContain("Gap b");
  });
});
