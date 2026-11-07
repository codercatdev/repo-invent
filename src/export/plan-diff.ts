import type { PlanAction, ScheduleItem, SchedulePlan } from "../types";

export interface PlanDiff {
  added: ScheduleItem[];
  removed: ScheduleItem[];
  moved: Array<{ from: ScheduleItem; to: ScheduleItem }>;
  unchanged: ScheduleItem[];
}

function identityOf(item: ScheduleItem): string {
  return item.sessionId !== undefined && item.sessionId.length > 0
    ? `id:${item.sessionId}`
    : `title:${item.title}|${item.start}`;
}

function compareItems(left: ScheduleItem, right: ScheduleItem): number {
  if (left.start !== right.start) return left.start.localeCompare(right.start);
  return left.title.localeCompare(right.title);
}

function allItems(plan: SchedulePlan): ScheduleItem[] {
  return plan.days.flatMap((day) => day.items);
}

/**
 * Compare two plans by session identity.
 *
 * A plan is something a person reviews before applying, so a session that keeps
 * its identity but changes slot is reported as moved rather than as a
 * remove/add pair.
 */
export function diffPlans(current: SchedulePlan, proposed: SchedulePlan): PlanDiff {
  const before = new Map<string, ScheduleItem>();
  for (const item of allItems(current)) before.set(identityOf(item), item);
  const after = new Map<string, ScheduleItem>();
  for (const item of allItems(proposed)) after.set(identityOf(item), item);

  const added: ScheduleItem[] = [];
  const removed: ScheduleItem[] = [];
  const moved: Array<{ from: ScheduleItem; to: ScheduleItem }> = [];
  const unchanged: ScheduleItem[] = [];

  for (const [key, next] of after) {
    const previous = before.get(key);
    if (!previous) {
      added.push(next);
      continue;
    }
    if (previous.start !== next.start || previous.venue !== next.venue) {
      moved.push({ from: previous, to: next });
      continue;
    }
    unchanged.push(next);
  }
  for (const [key, previous] of before) {
    if (!after.has(key)) removed.push(previous);
  }

  added.sort(compareItems);
  removed.sort(compareItems);
  moved.sort((left, right) => compareItems(left.to, right.to));
  unchanged.sort(compareItems);

  return { added, removed, moved, unchanged };
}

const ACTION_MARK: Record<PlanAction, string> = {
  reserve: "reserve",
  "favorite-walk-up": "walk-up",
  "favorite-watchlist": "watchlist",
  "personal-time": "personal",
};

function timeOf(iso: string): string {
  const match = /T(\d{2}:\d{2})/u.exec(iso);
  return match?.[1] ?? iso;
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Render the diff as unified-diff text: `-` for what is dropped, `+` for what
 * is added, one `@@` header per day. This is the review-before-apply surface.
 */
export function renderPlanDiff(diff: PlanDiff): string {
  const lines: string[] = [];
  const grouped = new Map<string, string[]>();

  const push = (day: string, line: string): void => {
    const list = grouped.get(day) ?? [];
    list.push(line);
    grouped.set(day, list);
  };

  for (const item of diff.removed) {
    push(dateOf(item.start), `- ${timeOf(item.start)} ${item.title} [${item.venue}]`);
  }
  for (const entry of diff.moved) {
    push(dateOf(entry.from.start), `- ${timeOf(entry.from.start)} ${entry.from.title} [${entry.from.venue}]`);
    push(dateOf(entry.to.start), `+ ${timeOf(entry.to.start)} ${entry.to.title} [${entry.to.venue}]`);
  }
  for (const item of diff.added) {
    push(dateOf(item.start), `+ ${timeOf(item.start)} ${item.title} [${item.venue}]`);
  }
  for (const item of diff.unchanged) {
    push(dateOf(item.start), `  ${timeOf(item.start)} ${item.title} [${item.venue}] (${ACTION_MARK[item.action]})`);
  }

  for (const day of [...grouped.keys()].sort()) {
    lines.push(`@@ ${day} @@`);
    for (const line of grouped.get(day) ?? []) lines.push(line);
    lines.push("");
  }

  if (lines.length === 0) lines.push("No differences.", "");
  lines.push(
    `${diff.added.length} added, ${diff.removed.length} removed, ${diff.moved.length} moved, ${diff.unchanged.length} unchanged.`,
    "",
  );
  return lines.join("\n").replace(/\n*$/u, "\n");
}
