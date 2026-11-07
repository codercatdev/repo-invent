import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { Party } from "@/lib/types";

/**
 * The parties dataset.
 *
 * `data/parties.json` is scraped from conferenceparties.com by
 * `scripts/parse-parties.mjs`, then enriched with a venue, an address where one
 * is public, and a map link. The file ships with the app, so this route reads it
 * once per process and caches the answer.
 */
export const runtime = "nodejs";

interface PartiesFile {
  parties: Party[];
  venueCount?: number;
  updatedAt?: string;
}

let cached: { body: PartiesFile; moment: number } | undefined;
const TTL_MS = 60 * 60 * 1000;

const PARTIES_PATH = join(process.cwd(), "data", "parties.json");

async function load(): Promise<PartiesFile> {
  if (cached !== undefined && Date.now() - cached.moment < TTL_MS) return cached.body;
  const raw = await readFile(/*turbopackIgnore: true*/ PARTIES_PATH, "utf8");
  const parsed = JSON.parse(raw) as PartiesFile;
  cached = { body: parsed, moment: Date.now() };
  return parsed;
}

export async function GET() {
  try {
    const data = await load();
    const days = [...new Set(data.parties.map((party) => party.date))].sort();
    // The order the page draws is decided here, so the client never re-sorts a
    // list it did not build.
    const parties = data.parties.slice().sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return String(left.start ?? "99").localeCompare(String(right.start ?? "99"));
    });
    return NextResponse.json(
      { count: parties.length, days, parties },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parties could not load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
