import { describe, expect, it } from "vitest";
import { createWebServer, scanForWeb } from "../src/web.js";

describe("web scan", () => {
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

  it("serves the page and the health check", async () => {
    const server = createWebServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });

      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("Invent 2026");
      expect(html).toContain("view-home");
      expect(html).toContain("/api/scan");

      const scanPage = await fetch(`http://127.0.0.1:${port}/scan`);
      expect(scanPage.status).toBe(200);
      expect(await scanPage.text()).toContain("repo:Invent");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("always declares a snapshot source the page can label", async () => {
    const { scanForWeb } = await import("../src/web.js");
    const real = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" },
      })) as typeof fetch;
    try {
      const result = await scanForWeb("https://github.com/aws-samples/aws-serverless-ecommerce-platform");
      // The fallback must name its origin; the page renders it verbatim, so an
      // absent value would silently present recorded data as a live read.
      expect(["live", "cached", "recorded"]).toContain(result.snapshotSource);
      expect(result.snapshotSource).toBe("recorded");
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.plan.remediation.tickets.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("refuses a request with no repo", async () => {
    const server = createWebServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
