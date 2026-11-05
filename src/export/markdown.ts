import type {
  TravelCheck,
  PlanAction,
  PlannedDay,
  RemediationPlan,
  RemediationTicket,
  ScheduleItem,
  SchedulePlan,
} from "../types.js";

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
  milestone?: string;
}

function timeOf(iso: string): string {
  const match = /T(\d{2}:\d{2})/u.exec(iso);
  return match?.[1] ?? iso;
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

const ACTION_LABEL: Record<PlanAction, string> = {
  reserve: "Reserve",
  "favorite-walk-up": "Walk-up queue",
  "favorite-watchlist": "YouTube watchlist",
  "personal-time": "Personal time",
};

function sessionLine(item: ScheduleItem): string {
  const code = item.level === undefined ? "" : ` (level ${item.level})`;
  return `- ${dateOf(item.start)} ${timeOf(item.start)}-${timeOf(item.end)} — ${item.title}${code} at ${item.venue}`;
}

/** One row per ticket, for the summary table. */
function ticketTable(plan: RemediationPlan, severityById: Map<string, string>): string[] {
  const lines = ["| Gap | Severity | Ticket | Effort |", "|---|---|---|---|"];
  for (const ticket of plan.tickets) {
    lines.push(
      `| ${escapeCell(ticket.gapId)} | ${escapeCell(severityById.get(ticket.gapId) ?? "medium")} | ${escapeCell(ticket.id)} | ${ticket.effort} |`,
    );
  }
  return lines;
}

function daySection(day: PlannedDay): string[] {
  const lines: string[] = [];
  const heading = `### ${day.date}`;
  lines.push(heading, "");
  lines.push("| Time | Session | Venue | Action |", "|---|---|---|---|");
  for (const item of day.items) {
    lines.push(
      `| ${timeOf(item.start)}-${timeOf(item.end)} | ${escapeCell(item.title)} | ${escapeCell(item.venue)} | ${ACTION_LABEL[item.action]} |`,
    );
  }
  const risky = day.transit.filter((check: TravelCheck) => !check.ok);
  if (risky.length > 0) {
    lines.push("");
    for (const check of risky) {
      lines.push(
        `> Tight transfer: ${check.fromTitle} → ${check.toTitle} leaves ${check.gapMinutes} min, needs ${check.requiredMinutes}.`,
      );
    }
  }
  return lines;
}

/**
 * Render the take-home plan as one Markdown document.
 *
 * Deterministic on purpose: the same plan must produce the same bytes, so a
 * reader can diff two runs and see only what actually changed.
 */
export function renderRemediationMarkdown(plan: RemediationPlan, schedule: SchedulePlan): string {
  const severityById = new Map<string, string>();
  for (const gap of schedule.gaps) severityById.set(gap.id, gap.severity);

  const lines: string[] = [];
  const repoName = `${schedule.repo.owner}/${schedule.repo.repo}`;
  lines.push(`# re:Invent 2026 remediation plan for ${repoName}`, "");
  lines.push(
    `${plan.tickets.length} architecture gap${plan.tickets.length === 1 ? "" : "s"} found, ` +
      `${plan.tickets.length} ticket${plan.tickets.length === 1 ? "" : "s"} written, ` +
      `${schedule.days.reduce((total, day) => total + day.items.length, 0)} scheduled sessions.`,
    "",
  );
  lines.push(
    `Scanned at ${schedule.fingerprint.scannedAt}. Target session level: ${schedule.fingerprint.recommendedLevel}.`,
    "",
  );

  if (plan.tickets.length > 0) {
    lines.push("## Tickets", "", ...ticketTable(plan, severityById), "");
  } else {
    lines.push("## Tickets", "", "No architecture gaps were found in the files that were read.", "");
  }

  const plansByTicket = new Map<string, ScheduleItem[]>();
  for (const day of schedule.days) {
    for (const item of day.items) {
      for (const gapId of item.gaps) {
        const ticket = plan.tickets.find((entry) => entry.gapId === gapId);
        if (!ticket) continue;
        const list = plansByTicket.get(ticket.id) ?? [];
        list.push(item);
        plansByTicket.set(ticket.id, list);
      }
    }
  }

  for (const ticket of plan.tickets) {
    lines.push(`## ${ticket.id}: ${ticket.title}`, "");
    lines.push(ticket.why, "");
    lines.push(`Effort: ${ticket.effort}`, "");
    const sessions = plansByTicket.get(ticket.id) ?? [];
    if (sessions.length > 0) {
      lines.push("Sessions that address this:", "");
      for (const item of sessions) lines.push(sessionLine(item));
      lines.push("");
    } else {
      lines.push("Sessions that address this: none scheduled for this gap.", "");
    }
    if (ticket.docLinks.length > 0) {
      lines.push("Reference:", "");
      for (const link of ticket.docLinks) lines.push(`- ${link}`);
      lines.push("");
    }
    lines.push("Acceptance test:", "");
    lines.push("- [ ] " + ticket.acceptanceTest.replace(/\r?\n/gu, " "), "");
  }

  lines.push("## Schedule", "");
  if (schedule.days.length === 0) {
    lines.push("No sessions were scheduled.", "");
  } else {
    for (const day of schedule.days) lines.push(...daySection(day), "");
  }

  if (schedule.personalTime.length > 0) {
    lines.push("## Protected time", "");
    for (const entry of schedule.personalTime) {
      lines.push(`- ${entry.startDateTime} to ${entry.endDateTime} — ${entry.title}${where(entry.location)}`);
    }
    lines.push("");
  }

  lines.push(
    `Data source: ${schedule.fingerprint.warnings.length > 0 ? "partial" : "complete"} catalog. ` +
      "Generated by repo-invent.",
    "",
  );
  return trimTrailingWhitespace(lines.join("\n"));
}

function where(location: string | undefined): string {
  return location === undefined ? "" : ` at ${location}`;
}

function trimTrailingWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\n*$/u, "\n");
}

/** Labels a ticket becomes, derived from what the gap touched. */
function labelsFor(livePlan: RemediationPlan, ticket: RemediationTicket): string[] {
  const labels = new Set<string>(["re:invent-remediation"]);
  const gap = livePlan.severityByGap?.[ticket.gapId];
  if (gap) labels.add(gap);
  if (ticket.effort === "S" || ticket.effort === "M" || ticket.effort === "L") {
    labels.add(`effort:${ticket.effort}`);
  }
  for (const service of ticket.taggedServices ?? []) labels.add(service.toLowerCase().replace(/\s+/gu, "-"));
  return [...labels].sort();
}

/** One issue draft per ticket. This tool never calls the GitHub API itself. */
export function renderIssueDrafts(plan: RemediationPlan): IssueDraft[] {
  return [...plan.tickets]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((ticket) => {
      const body: string[] = [];
      body.push(ticket.why, "");
      body.push("**Acceptance test**", "", "- [ ] " + ticket.acceptanceTest.replace(/\r?\n/gu, " "), "");
      if (ticket.sessionIds.length > 0) {
        body.push("**Sessions**", "");
        for (const id of ticket.sessionIds) body.push(`- ${id}`);
        body.push("");
      }
      if (ticket.docLinks.length > 0) {
        body.push("**Reference**", "");
        for (const link of ticket.docLinks) body.push(`- ${link}`);
        body.push("");
      }
      body.push(`Gap: \`${ticket.gapId}\`. Effort: ${ticket.effort}.`);
      const draft: IssueDraft = {
        title: `[re:Invent] ${ticket.title}`,
        body: body.join("\n").replace(/\n*$/u, "\n"),
        labels: labelsFor(plan, ticket),
        milestone: ticket.effort,
      };
      return draft;
    });
}

/**
 * Payloads for `POST /repos/{owner}/{repo}/issues`, one attempt per item.
 *
 * Nothing here sends a request: the reader decides whether to open issues.
 */
export function issuesToJson(drafts: IssueDraft[]): string {
  const payload = drafts.map((draft) => {
    const body = `<!-- repo-invent: /repos/{owner}/{repo}/issues -->\n\n${draft.body}`;
    return {
      title: draft.title,
      body,
      ...(draft.labels.length > 0 ? { labels: draft.labels } : {}),
    };
  });
  return JSON.stringify(payload, null, 2);
}
