import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReportFor, scanForWeb } from "./scan.js";

export { renderReportFor, scanForWeb };
import { readFile } from "node:fs/promises";
import { servedCatalog } from "./catalog-cache.js";
import { dataDir, loadConfig, loadFixture } from "./config.js";
import { AwsEventsClient } from "./api/events-client.js";
import { RemoteMcpBridge } from "./api/remote-mcp-bridge.js";
import {
  addPersonalTime,
  favoriteSession,
  mySchedule,
  removePersonalTime,
  sessionStatus,
  unfavoriteSession,
} from "./session.js";
import type { Catalog } from "./types.js";

const MAX_MCP_BYTES = 256 * 1024;
const MAX_BODY_BYTES = 4096;


function escapeReportText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function webDir(): string {
  const here = import.meta.url.startsWith("file:")
    ? dirname(fileURLToPath(import.meta.url))
    : dirname(import.meta.url);
  return join(here, "..", "web");
}

export function createWebServer(): ReturnType<typeof createServer> {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    // `/` is the app: four tabs. `app.html` is the same page under a second
    // name so a hash link survives a reload from any entry point.
    const pages: Record<string, string> = {
      "/": "app.html",
      "/index.html": "app.html",
      "/app": "app.html",
      "/app/": "app.html",
      "/app.html": "app.html",
      // Each tab has a plain path too, so a bookmark or a typed URL lands on
      // the tab instead of a 404. The page reads the path on load.
      "/home": "app.html",
      "/catalog": "app.html",
      "/calendar": "app.html",
      "/parties": "app.html",
      "/scan": "index.html",
      "/scan.html": "index.html",
    };
    const page = pages[url.pathname];
    if (request.method === "GET" && page !== undefined) {
      try {
        const html = await readFile(join(webDir(), page), "utf8");
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
        });
        response.end(html);
      } catch (error) {
        response.writeHead(500, { "Content-Type": "text/plain" });
        response.end(`web page not found: ${error instanceof Error ? error.message : "unknown"}`);
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/report") {
      const repo = url.searchParams.get("repo");
      if (!repo) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<p>Provide ?repo=&lt;github-url&gt;</p>");
        return;
      }
      try {
        const html = await renderReportFor(repo);
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
        });
        response.end(html);
      } catch (error) {
        const message = error instanceof Error ? error.message : "the scan failed";
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(`<p>${escapeReportText(message)}</p>`);
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/parties") {
      try {
        const raw = await readFile(join(dataDir(), "parties.json"), "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(raw),
          "Cache-Control": "public, max-age=3600",
        });
        void parsed;
        response.end(raw);
      } catch (error) {
        json(response, 500, { error: error instanceof Error ? error.message : "parties unavailable" });
      }
      return;
    }

    // The catalog the app browses. Fixture by default so the page needs no
    // account; REPO_INVENT_LIVE_CATALOG=1 reads the signed-in live catalog.
    if (request.method === "GET" && url.pathname === "/api/catalog") {
      try {
        const catalog = await servedCatalog();
        json(response, 200, {
          source: catalog.source,
          fetchedAt: catalog.fetchedAt,
          count: catalog.sessions.length,
          sessions: catalog.sessions,
        });
      } catch (error) {
        json(response, 500, { error: error instanceof Error ? error.message : "catalog failed" });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/unfavorite") {
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        json(response, 413, { error: error instanceof Error ? error.message : "body too large" });
        return;
      }
      let sessionId: unknown;
      try {
        sessionId = (JSON.parse(body) as { sessionId?: unknown }).sessionId;
      } catch {
        json(response, 400, { error: "body must be JSON" });
        return;
      }
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        json(response, 400, { error: "sessionId is required" });
        return;
      }
      try {
        json(response, 200, await unfavoriteSession(sessionId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "remove failed";
        json(response, /not signed in|no_tokens|sign in again/i.test(message) ? 401 : 400, {
          error: /not signed in|no_tokens|sign in again/i.test(message) ? "not signed in" : message,
        });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/personal-time") {
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        json(response, 413, { error: error instanceof Error ? error.message : "body too large" });
        return;
      }
      let input: { title?: unknown; start?: unknown; end?: unknown; location?: unknown };
      try {
        input = JSON.parse(body) as typeof input;
      } catch {
        json(response, 400, { error: "body must be JSON" });
        return;
      }
      if (typeof input.title !== "string" || typeof input.start !== "string" || typeof input.end !== "string") {
        json(response, 400, { error: "title, start and end are required" });
        return;
      }
      try {
        json(
          response,
          200,
          await addPersonalTime({
            title: input.title,
            start: input.start,
            end: input.end,
            ...(typeof input.location === "string" ? { location: input.location } : {}),
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "could not block time";
        json(response, /not signed in|no_tokens|sign in again/i.test(message) ? 401 : 400, {
          error: /not signed in|no_tokens|sign in again/i.test(message) ? "not signed in" : message,
        });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/personal-time/remove") {
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        json(response, 413, { error: error instanceof Error ? error.message : "body too large" });
        return;
      }
      let personalTimeId: unknown;
      try {
        personalTimeId = (JSON.parse(body) as { personalTimeId?: unknown }).personalTimeId;
      } catch {
        json(response, 400, { error: "body must be JSON" });
        return;
      }
      if (typeof personalTimeId !== "string" || personalTimeId.length === 0) {
        json(response, 400, { error: "personalTimeId is required" });
        return;
      }
      try {
        json(response, 200, await removePersonalTime(personalTimeId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "remove failed";
        json(response, /not signed in|no_tokens|sign in again/i.test(message) ? 401 : 400, {
          error: /not signed in|no_tokens|sign in again/i.test(message) ? "not signed in" : message,
        });
      }
      return;
    }

    // The same AWS Events operations, reached over the remote MCP server
    // rather than REST, so an agent can call one tool by name.
    if (request.method === "GET" && url.pathname === "/api/mcp/tools") {
      try {
        const tools = await new RemoteMcpBridge().listTools();
        json(response, 200, { count: tools.length, tools });
      } catch (error) {
        const message = error instanceof Error ? error.message : "MCP list failed";
        json(response, /not signed in|no_tokens|sign in again/i.test(message) ? 401 : 502, { error: message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/mcp/call") {
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        json(response, 413, { error: error instanceof Error ? error.message : "body too large" });
        return;
      }
      let parsed: { tool?: unknown; args?: unknown };
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        json(response, 400, { error: "body must be JSON" });
        return;
      }
      if (typeof parsed.tool !== "string" || parsed.tool.length === 0) {
        json(response, 400, { error: "tool is required" });
        return;
      }
      const args =
        parsed.args !== null && typeof parsed.args === "object"
          ? (parsed.args as Record<string, unknown>)
          : {};
      try {
        const result = await new RemoteMcpBridge().callTool(parsed.tool, args);
        // `ListSessions` answers with the whole catalog, about 316 KB of JSON.
        // An agent waiting on this route needs a bound, so a big payload is
        // reported by size with the advice that actually shrinks it, rather
        // than arriving whole.
        const text = JSON.stringify(result.content ?? [], null, 0);
        if (text.length > MAX_MCP_BYTES) {
          json(response, 413, {
            error: "the tool returned more than this route will pass on",
            bytes: text.length,
            advice: "call ListSessions with includeAbstracts=false, or page it with nextToken",
          });
          return;
        }
        // The MCP server marks a failed call `isError: false` when the tool
        // itself answered with an error body: a missing session comes back as
        // `{"message":"No session was found","httpStatus":404}`. Passing that
        // on as success is the exact trap the REST client already guards, so
        // the body is read here too.
        const bodyText = result.content
          .map((part) => (part as { text?: string }).text ?? "")
          .join("");
        // A batch write answers 200 with per-id failures inside `result`, so a
        // refusal like `insufficientAccess` arrives in a successful-looking
        // body. Both shapes count as a failure here.
        const failure =
          /"httpStatus"\s*:\s*(4\d\d|5\d\d)/u.test(bodyText) ||
          /"failed"\s*:\s*\[\s*\{/u.test(bodyText);
        json(response, result.isError || failure ? 422 : 200, {
          ...result,
          ...(failure ? { failure: true } : {}),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "tool call failed";
        json(response, /not signed in|no_tokens|sign in again/i.test(message) ? 401 : 502, { error: message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      try {
        json(response, 200, await sessionStatus());
      } catch (error) {
        json(response, 500, { error: error instanceof Error ? error.message : "status failed" });
      }
      return;
    }

    // Sign-in runs on this machine because AWS only accepts a loopback
    // redirect. The CLI does the browser dance; this route reports whether a
    // live token is already on disk.
    if (request.method === "POST" && url.pathname === "/api/favorite") {
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        json(response, 413, { error: error instanceof Error ? error.message : "body too large" });
        return;
      }
      let sessionId: unknown;
      try {
        sessionId = (JSON.parse(body) as { sessionId?: unknown }).sessionId;
      } catch {
        json(response, 400, { error: "body must be JSON" });
        return;
      }
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        json(response, 400, { error: "sessionId is required" });
        return;
      }
      try {
        json(response, 200, await favoriteSession(sessionId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "favourite failed";
        json(response, /not signed in|no_tokens|sign in again/i.test(message) ? 401 : 400, {
          error: /not signed in|no_tokens|sign in again/i.test(message) ? "not signed in" : message,
        });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/schedule") {
      try {
        json(response, 200, await mySchedule());
      } catch (error) {
        const message = error instanceof Error ? error.message : "schedule failed";
        // "not signed in" is a normal state the page renders, not a fault.
        if (/not signed in|no_tokens|sign in again|refresh token/i.test(message)) {
          json(response, 401, { error: "not signed in" });
        } else {
          json(response, 400, { error: message });
        }
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/scan") {
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        json(response, 413, { error: error instanceof Error ? error.message : "body too large" });
        return;
      }
      let repo: unknown;
      try {
        repo = (JSON.parse(body) as { repo?: unknown }).repo;
      } catch {
        json(response, 400, { error: "body must be JSON" });
        return;
      }
      if (typeof repo !== "string" || repo.trim().length === 0) {
        json(response, 400, { error: "repo must be a GitHub URL" });
        return;
      }
      try {
        const result = await scanForWeb(repo.trim());
        json(response, 200, result);
      } catch (error) {
        json(response, 400, {
          error: error instanceof Error ? error.message : "the scan failed",
        });
      }
      return;
    }

    json(response, 404, { error: "not found" });
  });
}

const isEntry =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("web.js") || process.argv[1].endsWith("web.ts"));

if (isEntry) {
  const port = Number(process.env["REPO_INVENT_PORT"] ?? 8080);
  // Loopback by default. A bind address can be given explicitly, so the demo can
  // be reached from a phone on the same network, but nothing listens publicly
  // unless someone asked for it.
  const bind = process.env["REPO_INVENT_BIND"] ?? "127.0.0.1";
  createWebServer().listen(port, bind, () => {
    const shown = bind === "0.0.0.0" ? "all interfaces" : bind;
    process.stdout.write(`repo:Invent web demo on http://${shown}:${port}\n`);
  });
}
