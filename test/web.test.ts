import { describe, expect, it } from "vitest";
import { scanForWeb } from "../src/scan.js";

describe("web scan engine", () => {
  it("reports a rate limit as a readable error, not a crash", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" },
      })) as typeof fetch;
    try {
      await expect(scanForWeb("https://github.com/o/r")).rejects.toThrow(/rate limit/i);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("always declares a snapshot source the page can label", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" },
      })) as typeof fetch;
    try {
      const result = await scanForWeb("https://github.com/aws-samples/aws-serverless-ecommerce-platform");
      expect(["live", "cached", "recorded"]).toContain(result.snapshotSource);
      expect(result.snapshotSource).toBe("recorded");
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.plan.remediation.tickets.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = real;
    }
  });
});
