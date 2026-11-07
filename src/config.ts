import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

export function loadFixture(path?: string): FixtureCatalogLike {
  const target = path ?? join(dataDir(), "mock-reinvent2026.json");
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ target, "utf8")) as FixtureCatalogLike;
}

export function dataDir(): string {
  const cwdData = join(process.cwd(), "data");
  if (existsSync(/*turbopackIgnore: true*/ cwdData)) return cwdData;
  const here = import.meta.url;
  if (here.startsWith("file:")) {
    const dir = dirname(fileURLToPath(here));
    return join(dir, "..", "data");
  }
  return cwdData;
}

/** Redact anything that smells like a credential before it reaches a log. */
export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "Bearer <redacted>")
    .replace(/(token|secret|password)["'\s:=]+[A-Za-z0-9._-]{8,}/giu, "$1=<redacted>");
}
