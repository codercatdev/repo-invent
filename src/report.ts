import type { PrescriptionPlan } from "./types.js";

/** Escape text for safe insertion into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeOf(iso: string): string {
  return iso.slice(11, 16);
}

const ACTION_LABEL: Record<string, string> = {
  reserve: "Reserve",
  "favorite-walk-up": "Walk-up queue",
  "favorite-watchlist": "Watchlist",
  "personal-time": "Personal time",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/**
 * Render a plan as one self-contained HTML page.
 *
 * This is the artifact a reader keeps: no server, no script, no network. It
 * survives being mailed, printed, or opened years later, which is the point of
 * a take-home plan.
 */
export function renderReportHtml(plan: PrescriptionPlan): string {
  const repoOwner = escapeHtml(plan.schedule.repo.owner);
  const repoName = escapeHtml(plan.schedule.repo.repo);
  const sessionCount = plan.schedule.days.reduce((total, day) => total + day.items.length, 0);
  const gapWord = plan.gaps.length === 1 ? "gap" : "gaps";
  const ticketWord = plan.remediation.tickets.length === 1 ? "ticket" : "tickets";

  const gaps = plan.gaps
    .map((gap) => {
      const paths = [...new Set(gap.evidence.flatMap((entry) => entry.paths))];
      const codes = paths.map((path) => `<code>${escapeHtml(path)}</code>`).join(" ");
      return `<article class="gap ${escapeHtml(gap.severity)}">
  <span class="sev">${escapeHtml(gap.severity)}</span>
  <h3>${escapeHtml(gap.title)}</h3>
  <p>${escapeHtml(gap.why)}</p>
  <p class="ev">${codes}</p>
</article>`;
    })
    .join("\n");

  const tickets = plan.remediation.tickets
    .map(
      (ticket) => `<article class="ticket">
  <h3>${escapeHtml(ticket.id)} — ${escapeHtml(ticket.title)}</h3>
  <p>${escapeHtml(ticket.why)}</p>
  <p class="effort">Effort: ${escapeHtml(ticket.effort)}</p>
  <p class="accept">Acceptance test: ${escapeHtml(ticket.acceptanceTest)}</p>
</article>`,
    )
    .join("\n");

  const days = plan.schedule.days
    .map((day) => {
      const rows = day.items
        .map(
          (item) => `<tr>
  <td class="t">${escapeHtml(timeOf(item.start))}–${escapeHtml(timeOf(item.end))}</td>
  <td>${escapeHtml(item.title)}</td>
  <td class="v">${escapeHtml(item.venue)}</td>
  <td><span class="tag">${escapeHtml(actionLabel(item.action))}</span></td>
</tr>`,
        )
        .join("\n");
      return `<section class="day">
<h3>${escapeHtml(day.date)}</h3>
<table><thead><tr><th>Time</th><th>Session</th><th>Venue</th><th>Action</th></tr></thead>
<tbody>
${rows}
</tbody></table>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>re:Invent 2026 plan for ${repoOwner}/${repoName}</title>
<style>
  body { font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 820px; margin: 0 auto; padding: 40px 24px 80px; color: #1a1a1a; background: #fff; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 13px; letter-spacing: 1.2px; text-transform: uppercase; color: #666;
       margin: 34px 0 12px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
  h3 { font-size: 15px; margin: 0 0 6px; }
  p { margin: 0 0 8px; }
  .meta { color: #666; font-size: 13.5px; }
  .gap, .ticket { border-left: 3px solid #ddd; padding: 10px 0 10px 14px; margin-bottom: 12px; }
  .gap.high { border-left-color: #c62828; }
  .gap.medium { border-left-color: #ef6c00; }
  .gap.low { border-left-color: #2e7d32; }
  .sev { font-size: 10.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
         color: #666; display: block; margin-bottom: 3px; }
  .ev code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
  .accept { background: #f7f7f7; padding: 8px 10px; border-radius: 5px; font-size: 13.5px; }
  .effort { color: #666; font-size: 13px; }
  .day { margin-bottom: 18px; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.6px;
       color: #777; border-bottom: 1px solid #e5e5e5; padding: 4px 8px; }
  td { border-bottom: 1px solid #f0f0f0; padding: 6px 8px; }
  td.t { white-space: nowrap; font-family: ui-monospace, Menlo, monospace; color: #555; }
  td.v { color: #666; font-size: 13px; }
  .tag { font-size: 11.5px; border: 1px solid #ddd; border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
  footer { margin-top: 40px; color: #888; font-size: 12.5px; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { padding: 0; font-size: 11.5pt; } @page { margin: 16mm; } }
</style>
</head>
<body>
<header>
<h1>re:Invent 2026 remediation plan for ${repoOwner}/${repoName}</h1>
<p class="meta">
${plan.gaps.length} architecture ${gapWord} found, ${plan.remediation.tickets.length} ${ticketWord} written, ${sessionCount} scheduled sessions.
Target session level: ${plan.fingerprint.recommendedLevel}.
</p>
</header>

<h2>Architecture gaps</h2>
${gaps.length > 0 ? gaps : '<p class="meta">No gaps were found in the files that were read.</p>'}

<h2>Tickets</h2>
${tickets.length > 0 ? tickets : '<p class="meta">No tickets: no gaps.</p>'}

<h2>The week</h2>
${days.length > 0 ? days : '<p class="meta">Nothing scheduled.</p>'}

<footer>
Generated by repo:Invent on ${escapeHtml(plan.fingerprint.scannedAt)}.<br>
Scan a repository, diagnose its AWS architecture gaps, plan a walkable re:Invent week, and leave with tickets that have acceptance tests.
</footer>
</body>
</html>`;
}
