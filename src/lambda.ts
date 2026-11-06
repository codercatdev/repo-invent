import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AwsEventsClient } from "./api/events-client.js";
import { servedCatalog } from "./catalog-cache.js";
import { dataDir, loadConfig, loadFixture } from "./config.js";
import { renderReportFor, scanForWeb } from "./web.js";
import type { Catalog } from "./types.js";

interface LambdaEvent {
  rawPath?: string;
  rawQueryString?: string;
  requestContext?: { http?: { method?: string } };
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface LambdaResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

const MAX_BODY_BYTES = 4096;

function html(response: string, status = 200): LambdaResult {
  return {
    statusCode: status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: response,
  };
}

function json(status: number, body: unknown): LambdaResult {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function webDir(): string {
  const here = import.meta.url.startsWith("file:")
    ? dirname(fileURLToPath(import.meta.url))
    : dirname(import.meta.url);
  // dist/lambda.js -> ../web in the packaged bundle.
  return join(here, "..", "web");
}

/**
 * One request on AWS Lambda behind a Function URL.
 *
 * The page and the scan endpoint are the whole surface. Nothing here writes to
 * an account, and the catalog stays the fixture unless REPO_INVENT_LIVE_CATALOG
 * is set on the function.
 */
export async function handler(event: LambdaEvent): Promise<LambdaResult> {
  const path = event.rawPath ?? "/";
  const method = event.requestContext?.http?.method ?? "GET";

  // `/` is the four-tab app; `/scan` keeps the original single-purpose page.
  const page =
    path === "/" || path === "/index.html" || path === "" || path === "/app" || path === "/app.html"
      ? "app.html"
      : path === "/scan" || path === "/scan.html"
        ? "index.html"
        : undefined;
  if (method === "GET" && page !== undefined) {
    try {
      return html(await readFile(join(webDir(), page), "utf8"));
    } catch (error) {
      return html(
        `page not found in the bundle: ${error instanceof Error ? error.message : "unknown"}`,
        500,
      );
    }
  }

  if (method === "GET" && path === "/api/parties") {
    try {
      const raw = await readFile(join(dataDir(), "parties.json"), "utf8");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        body: raw,
      };
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : "parties unavailable" });
    }
  }

  if (method === "GET" && path === "/api/catalog") {
    try {
      const catalog = await servedCatalog();
      return json(200, {
        source: catalog.source,
        fetchedAt: catalog.fetchedAt,
        count: catalog.sessions.length,
        sessions: catalog.sessions,
      });
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : "catalog failed" });
    }
  }

  if (method === "GET" && (path === "/health" || path === "/health/")) {
    return json(200, { ok: true });
  }

  if (method === "POST" && path === "/api/scan") {
    const raw = event.isBase64Encoded && typeof event.body === "string"
      ? Buffer.from(event.body, "base64").toString("utf8")
      : (event.body ?? "");
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "request body too large" });
    let repo: unknown;
    try {
      repo = (JSON.parse(raw) as { repo?: unknown }).repo;
    } catch {
      return json(400, { error: "body must be JSON" });
    }
    if (typeof repo !== "string" || repo.trim().length === 0) {
      return json(400, { error: "repo must be a GitHub URL" });
    }
    try {
      return json(200, await scanForWeb(repo.trim()));
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "the scan failed" });
    }
  }

  // The take-home report: one self-contained page a reader can save or print.
  if (method === "GET" && path === "/report") {
    const repo = new URLSearchParams(event.rawQueryString ?? "").get("repo");
    if (!repo) return html("<p>Provide ?repo=&lt;github-url&gt;</p>", 400);
    try {
      return html(await renderReportFor(repo));
    } catch (error) {
      return html(
        `<p>${error instanceof Error ? error.message : "the scan failed"}</p>`,
        400,
      );
    }
  }

  return json(404, { error: "not found" });
}
