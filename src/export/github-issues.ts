import type { IssueDraft } from "./markdown.js";

export { renderIssueDrafts, issuesToJson } from "./markdown.js";
export type { IssueDraft };

export const GITHUB_ISSUES_ENDPOINT = "POST /repos/{owner}/{repo}/issues";

export function summariseDrafts(drafts: IssueDraft[]): string {
  if (drafts.length === 0) return "No issues to open.";
  const byEffort = new Map<string, number>();
  for (const draft of drafts) {
    const effort = draft.milestone ?? "unset";
    byEffort.set(effort, (byEffort.get(effort) ?? 0) + 1);
  }
  const parts = [...byEffort.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([effort, count]) => `${count} of effort ${effort}`);
  return `${drafts.length} issue draft${drafts.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}
