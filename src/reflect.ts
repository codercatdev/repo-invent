import type { ArchitecturalGap } from "./types";

export interface Reflection {
  sessionId: string;
  title: string;
  /** 1 to 5. Anything outside is clamped rather than refused. */
  rating: number;
  note: string;
  /** Gap ids this session was scheduled to address. */
  gapIds: string[];
  at: string;
}

export interface Progress {
  closed: ArchitecturalGap[];
  open: ArchitecturalGap[];
  /** One line a person can read out loud. */
  summary: string;
}

/**
 * A session counts as covering a gap when it was planned for it and got a
 * rating of 3 or more. A low rating means the talk did not land, so the gap
 * stays open: telling someone a gap is closed because they sat in a room is the
 * same false comfort as an unverified reservation.
 */
export const CLOSING_RATING = 3;

/** Read the reflections a browser stored, tolerating anything malformed. */
export function parseReflections(raw: unknown): Reflection[] {
  if (!Array.isArray(raw)) return [];
  const out: Reflection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item["sessionId"] !== "string") continue;
    if (typeof item["title"] !== "string") continue;
    const rating = Number(item["rating"]);
    if (!Number.isFinite(rating)) continue;
    out.push({
      sessionId: item["sessionId"],
      title: item["title"],
      rating: Math.min(5, Math.max(1, Math.round(rating))),
      note: typeof item["note"] === "string" ? item["note"] : "",
      gapIds: Array.isArray(item["gapIds"])
        ? item["gapIds"].filter((id): id is string => typeof id === "string")
        : [],
      at: typeof item["at"] === "string" ? item["at"] : new Date(0).toISOString(),
    });
  }
  return out;
}

/**
 * Split the diagnosed gaps into the ones a reflection has covered and the ones
 * still open, and say so in one sentence.
 */
export function progressFrom(gaps: ArchitecturalGap[], reflections: Reflection[]): Progress {
  const covered = new Set<string>();
  for (const reflection of reflections) {
    if (reflection.rating < CLOSING_RATING) continue;
    for (const gapId of reflection.gapIds) covered.add(gapId);
  }
  const closed = gaps.filter((gap) => covered.has(gap.id));
  const open = gaps.filter((gap) => !covered.has(gap.id));

  const rated = reflections.length;
  const summary =
    rated === 0
      ? `${open.length} gap${open.length === 1 ? "" : "s"} open. Rate a session to start closing them.`
      : `${closed.length} of ${gaps.length} gap${gaps.length === 1 ? "" : "s"} closed from ${rated} rated session${rated === 1 ? "" : "s"}.`;

  return { closed, open, summary };
}

/** A short Markdown record of what was learned, for the article or a team note. */
export function reflectionsToMarkdown(reflections: Reflection[], progress: Progress): string {
  const lines: string[] = ["# What I learned at re:Invent 2026", ""];
  lines.push(progress.summary, "");
  if (reflections.length === 0) {
    lines.push("No sessions rated yet.", "");
    return lines.join("\n");
  }
  const sorted = [...reflections].sort((left, right) => right.rating - left.rating);
  for (const reflection of sorted) {
    const stars = "★".repeat(reflection.rating) + "☆".repeat(5 - reflection.rating);
    lines.push(`## ${reflection.title}`, "", `${stars}`, "");
    if (reflection.note.length > 0) lines.push(reflection.note, "");
    if (reflection.gapIds.length > 0) lines.push(`Closes: ${reflection.gapIds.join(", ")}`, "");
  }
  if (progress.open.length > 0) {
    lines.push("## Still open", "");
    for (const gap of progress.open) lines.push(`- ${gap.title}`);
    lines.push("");
  }
  return lines.join("\n");
}
