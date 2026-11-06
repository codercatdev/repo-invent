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
      expect(html).toContain("repo:Invent");
      expect(html).toContain("/api/scan");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
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
