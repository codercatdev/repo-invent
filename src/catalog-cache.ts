import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AwsEventsClient } from "./api/events-client.js";
import { dataHome, loadConfig, loadFixture } from "./config.js";
import type { Catalog, ReinventSession } from "./types.js";

/**
 * The catalog the app browses.
 *
 * The live catalog is 2,476 entries and costs several pages of API calls, so it
 * is cached on disk and refreshed only when stale. This module is the one place
 * that decides whether the browser sees live, cached or fixture data, and it
 * always says which, so the page never presents synthetic data as real.
 */

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

export interface ServedCatalog {
  source: "live" | "cached" | "fixture";
  fetchedAt: string;
  sessions: ReinventSession[];
}

function cachePath(): string {
  return join(dataHome(), "catalog-cache.json");
}

function readCache(): { fetchedAt: string; sessions: ReinventSession[] } | undefined {
  const path = cachePath();
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      fetchedAt?: unknown;
      sessions?: unknown;
    };
    if (typeof parsed.fetchedAt !== "string" || !Array.isArray(parsed.sessions)) return undefined;
    return { fetchedAt: parsed.fetchedAt, sessions: parsed.sessions as ReinventSession[] };
  } catch {
    return undefined;
  }
}

function writeCache(catalog: Catalog): void {
  try {
    mkdirSync(dataHome(), { recursive: true });
    writeFileSync(
      cachePath(),
      JSON.stringify({ fetchedAt: catalog.fetchedAt, sessions: catalog.sessions }),
      "utf8",
    );
  } catch {
    // A cache that cannot be written is a slow page, not a failed request.
  }
}

/**
 * Read the catalog, preferring live data, then a cache under the TTL, then
 * whatever cache exists even if stale, then the bundled fixture.
 *
 * Set REPO_INVENT_LIVE_CATALOG=0 to skip the network entirely; every miss is
 * reported through `source` so a fixture result is never shown as live.
 */
export async function servedCatalog(): Promise<ServedCatalog> {
  const config = loadConfig();
  const allowLive = process.env["REPO_INVENT_LIVE_CATALOG"] !== "0";
  const cached = readCache();
  const cacheAge = cached === undefined ? Number.POSITIVE_INFINITY : Date.now() - Date.parse(cached.fetchedAt);

  if (cached !== undefined && cacheAge < CATALOG_TTL_MS) {
    return { source: "cached", fetchedAt: cached.fetchedAt, sessions: cached.sessions };
  }

  if (allowLive) {
    try {
      const client = new AwsEventsClient({ eventId: config.eventId });
      const catalog = await client.listSessions({ includeAbstracts: false });
      writeCache(catalog);
      return { source: "live", fetchedAt: catalog.fetchedAt, sessions: catalog.sessions };
    } catch {
      // Falls through to a stale cache or the fixture.
    }
  }

  if (cached !== undefined) {
    return { source: "cached", fetchedAt: cached.fetchedAt, sessions: cached.sessions };
  }

  const fixture = loadFixture() as unknown as Catalog;
  return { source: "fixture", fetchedAt: fixture.fetchedAt, sessions: fixture.sessions };
}
