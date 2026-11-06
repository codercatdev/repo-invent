import { describe, expect, it } from "vitest";
import { handler } from "../src/lambda.js";

describe("lambda handler", () => {
  it("serves the page", async () => {
    const result = await handler({ rawPath: "/", requestContext: { http: { method: "GET" } } });
    expect(result.statusCode).toBe(200);
    expect(result.headers["Content-Type"]).toContain("text/html");
    expect(result.body).toContain("Invent 2026");
  });

  it("serves the original scan page at /scan", async () => {
    const result = await handler({ rawPath: "/scan", requestContext: { http: { method: "GET" } } });
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("repo:Invent");
  });

  it("answers the health check", async () => {
    const result = await handler({ rawPath: "/health", requestContext: { http: { method: "GET" } } });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
  });

  it("rejects a scan with no repo", async () => {
    const result = await handler({
      rawPath: "/api/scan",
      requestContext: { http: { method: "POST" } },
      body: JSON.stringify({}),
    });
    expect(result.statusCode).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const result = await handler({
      rawPath: "/api/scan",
      requestContext: { http: { method: "POST" } },
      body: "{not json",
    });
    expect(result.statusCode).toBe(400);
  });

  it("rejects an oversized body", async () => {
    const result = await handler({
      rawPath: "/api/scan",
      requestContext: { http: { method: "POST" } },
      body: "x".repeat(5000),
    });
    expect(result.statusCode).toBe(413);
  });

  it("returns 404 for anything else", async () => {
    const result = await handler({ rawPath: "/nope", requestContext: { http: { method: "GET" } } });
    expect(result.statusCode).toBe(404);
  });
});
