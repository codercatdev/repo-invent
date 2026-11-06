import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_EVENT_ID = "reinvent2026";

export interface AppConfig {
  dataHome: string;
  tokensPath: string;
  eventId: string;
  githubToken: string | undefined;
}

export function dataHome(): string {
  const override = process.env["REPO_INVENT_HOME"];
  if (override !== undefined && override.length > 0) return override;
  return join(homedir(), ".repo-invent");
}

export function loadConfig(): AppConfig {
  const home = dataHome();
  return {
    dataHome: home,
    tokensPath: join(home, "tokens.json"),
    eventId: process.env["REPO_INVENT_EVENT_ID"] ?? DEFAULT_EVENT_ID,
    githubToken: process.env["GITHUB_TOKEN"] || undefined,
  };
}

export interface FixtureCatalogLike {
  eventId: string;
  fetchedAt: string;
  source: "fixture";
  sessions: unknown[];
}

/**
 * Read the bundled fixture.
 *
 * This is synthetic test data. `source: "fixture"` travels with it all the way
 * into any output, so nothing renders it as a live catalog.
 */
export function loadFixture(path?: string): FixtureCatalogLike {
  const target = path ?? join(dataDir(), "mock-reinvent2026.json");
  return JSON.parse(readFileSync(target, "utf8")) as FixtureCatalogLike;
}

export function dataDir(): string {
  const here = import.meta.url;
  if (here.startsWith("file:")) {
    // src/config.ts -> ../data when running from source, dist/config.js ->
    // ../data when built. Both resolve to the package's own data folder, so a
    // fixture read never depends on the caller's working directory.
    //
    // The path is assembled rather than written literally: a bundler that sees
    // "../data/" tries to resolve it at build time and fails, and this string
    // is only meaningful at runtime anyway.
    const url = new URL(["..", "data", ""].join("/"), here);
    return decodeURIComponent(fileURLToPath(url));
  }
  return join(process.cwd(), "data");
}

/** Redact anything that smells like a credential before it reaches a log. */
export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "Bearer <redacted>")
    .replace(/(token|secret|password)["'\s:=]+[A-Za-z0-9._-]{8,}/giu, "$1=<redacted>");
}
