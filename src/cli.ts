#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { signIn, signOut, getValidTokens } from "./auth/pkce.js";
import { loadConfig, loadFixture, redact } from "./config.js";
import { AwsEventsClient } from "./api/events-client.js";
import { fetchRepo } from "./scanner/repo-fetch.js";
import { scanManifests } from "./scanner/manifest-parser.js";
import { scanIac, hasWildcardIam } from "./scanner/iac-parser.js";
import { buildFingerprint, diagnose } from "./scanner/diagnostics.js";
import { prescribe } from "./solver/scorer.js";
import { issuesToJson, renderIssueDrafts, renderRemediationMarkdown } from "./export/index.js";
import type { ArchitecturalGap, Catalog, PrescriptionPlan, StackFingerprint } from "./types.js";

const WEB_FRAMEWORKS = new Set([
  "Express",
  "Fastify",
  "Next.js",
  "NestJS",
  "Django",
  "Flask",
  "FastAPI",
  "Gin",
  "Axum",
]);

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    positional.push(token);
  }
  return { command, positional, flags };
}

const HELP = `repo-invent — read a public repo, learn what re:Invent should teach you

Usage:
  repo-invent scan <repo-url> [--json]
  repo-invent plan <repo-url> [--offline] [--json] [--out <dir>]
  repo-invent diff <current-plan.json> <proposed-plan.json>
  repo-invent login
  repo-invent logout
  repo-invent apply --file <plan.json> [--yes]
  repo-invent export --file <plan.json> [--out <dir>]
  repo-invent mcp
  repo-invent audit [--offline]

Commands:
  scan      Read a public GitHub repo and report its AWS stack and gaps. No sign-in.
  plan      Scan, then prescribe a schedule and a remediation plan. No sign-in needed.
  diff      Show what changed between two plans.
  login     Sign in with AWS Builder ID.
  logout    Revoke the stored token.
  apply     Reserve and favourite the sessions a plan calls for. Needs sign-in and --yes.
  export    Write reinvent-plan.md and issues.json from a plan.
  mcp       Run the local MCP server on stdio.
  audit     Probe which AWS Events operations this account can reach.

Environment:
  GITHUB_TOKEN          Raises GitHub rate limits; not required.
  REPO_INVENT_EVENT_ID  Event to plan against. Default reinvent2026.
  REPO_INVENT_HOME      Where tokens are stored. Default ~/.repo-invent.
`;

async function scanRepo(url: string): Promise<{
  fingerprint: StackFingerprint;
  gaps: ArchitecturalGap[];
}> {
  const config = loadConfig();
  const result = await fetchRepo(
    url,
    config.githubToken === undefined ? {} : { token: config.githubToken },
  );
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  const snapshot = result.snapshot;
  const manifestScan = scanManifests(snapshot);
  const iacScan = scanIac(snapshot);
  const fingerprint = buildFingerprint({ snapshot, manifestScan, iacScan });
  const gaps = diagnose({
    fingerprint,
    iacScan,
    snapshot,
    wildcardIam: hasWildcardIam(snapshot),
    hasWebFramework: fingerprint.frameworks.some((name) => WEB_FRAMEWORKS.has(name)),
  });
  return { fingerprint, gaps };
}

function buildClient(offline: boolean, eventId: string): AwsEventsClient {
  if (offline) return new AwsEventsClient({ eventId, fixture: loadFixture() as unknown as Catalog });
  return new AwsEventsClient({ eventId });
}

async function prescription(url: string, offline: boolean): Promise<PrescriptionPlan> {
  const config = loadConfig();
  const scanned = await scanRepo(url);
  const client = new AwsEventsClient({
    eventId: config.eventId,
    ...(offline ? { fixture: loadFixture() as unknown as Catalog } : {}),
  });
  const catalog = await client.listSessions({ includeAbstracts: false });
  return prescribe(catalog, scanned.fingerprint, scanned.gaps);
}

function printPlan(plan: PrescriptionPlan): void {
  const out: string[] = [];
  out.push(`Repo: ${plan.schedule.repo.owner}/${plan.schedule.repo.repo}`);
  const catalogSource = plan.schedule.eventId ? "catalog" : "";
  void catalogSource;
  if (plan.fingerprint.services.length > 0) {
    out.push(`Services: ${plan.fingerprint.services.map((service) => service.service).join(", ")}`);
  }
  out.push(`Recommended level: ${plan.fingerprint.recommendedLevel}`);
  if (plan.fingerprint.warnings.length > 0) {
    for (const warning of plan.fingerprint.warnings) out.push(`Note: ${warning}`);
  }
  out.push("");
  if (plan.gaps.length === 0) {
    out.push("No architecture gaps found in the files that were read.");
    return;
  }
  out.push(`Gaps (${plan.gaps.length}):`);
  for (const gap of plan.gaps) {
    out.push(`  [${gap.severity}] ${gap.title}`);
    out.push(`    ${gap.why}`);
    const paths = [...new Set(gap.evidence.flatMap((item) => item.paths))];
    if (paths.length > 0) out.push(`    evidence: ${paths.join(", ")}`);
  }
  out.push("");
  out.push(`Tickets (${plan.remediation.tickets.length}):`);
  for (const ticket of plan.remediation.tickets) {
    out.push(`  ${ticket.id} (${ticket.effort}) ${ticket.title}`);
    out.push(`    accept: ${ticket.acceptanceTest}`);
  }
  out.push("");
  for (const day of plan.schedule.days) {
    out.push(`${day.date}`);
    for (const item of day.items) {
      out.push(`  ${item.start.slice(11, 16)}-${item.end.slice(11, 16)}  ${item.action.padEnd(18)} ${item.title} @ ${item.venue}`);
    }
  }
  const risky = plan.schedule.days.flatMap((day) => day.transit).filter((check) => !check.ok);
  if (risky.length > 0) {
    out.push("");
    out.push("Tight transfers:");
    for (const check of risky) {
      out.push(`  ${check.fromTitle} -> ${check.toTitle}: ${check.gapMinutes} min, needs ${check.requiredMinutes}`);
    }
  }
  process.stdout.write(out.join("\n") + "\n");
}

function writeExports(plan: PrescriptionPlan, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const markdownPath = join(outDir, "reinvent-plan.md");
  const issuesPath = join(outDir, "issues.json");
  writeFileSync(markdownPath, renderRemediationMarkdown(plan.remediation, plan.schedule), "utf8");
  writeFileSync(issuesPath, issuesToJson(renderIssueDrafts(plan.remediation)), "utf8");
  return [markdownPath, issuesPath];
}

function readPlan(path: string): PrescriptionPlan {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as PrescriptionPlan;
}

async function run(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  const config = loadConfig();

  switch (command) {
    case "help":
    case "--help":
    case "-h": {
      process.stdout.write(HELP);
      return 0;
    }

    case "scan": {
      const url = positional[0];
      if (url === undefined) throw new Error("usage: repo-invent scan <repo-url>");
      const scanned = await scanRepo(url);
      if (flags.has("json")) {
        process.stdout.write(JSON.stringify(scanned, null, 2) + "\n");
      } else {
        process.stdout.write(`${JSON.stringify(scanned.fingerprint, null, 2)}\n`);
        for (const gap of scanned.gaps) {
          process.stdout.write(`[${gap.severity}] ${gap.title}\n  ${gap.why}\n`);
        }
      }
      return 0;
    }

    case "plan": {
      const url = positional[0];
      if (url === undefined) throw new Error("usage: repo-invent plan <repo-url>");
      const plan = await prescription(url, flags.has("offline"));
      const outDir = typeof flags.get("out") === "string" ? String(flags.get("out")) : undefined;
      if (outDir !== undefined) {
        const written = writeExports(plan, outDir);
        for (const path of written) process.stdout.write(`wrote ${path}\n`);
      }
      if (flags.has("json")) {
        process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
      } else {
        printPlan(plan);
      }
      return 0;
    }

    case "diff": {
      const [currentPath, proposedPath] = positional;
      if (currentPath === undefined || proposedPath === undefined) {
        throw new Error("usage: repo-invent diff <current-plan.json> <proposed-plan.json>");
      }
      const { diffPlans, renderPlanDiff } = await import("./export/plan-diff.js");
      const diff = diffPlans(readPlan(currentPath).schedule, readPlan(proposedPath).schedule);
      process.stdout.write(renderPlanDiff(diff));
      return 0;
    }

    case "login": {
      const result = await signIn({
        onAuthorize: (url) => {
          process.stdout.write(`Open this URL to sign in:\n${url}\n`);
        },
      });
      process.stdout.write(`Signed in. Tokens stored (redirect ${result.redirectUri}).\n`);
      return 0;
    }

    case "logout": {
      await signOut();
      process.stdout.write("Signed out and revoked the token.\n");
      return 0;
    }

    case "apply": {
      const file = flags.get("file");
      if (typeof file !== "string") throw new Error("usage: repo-invent apply --file <plan.json> [--yes]");
      const plan = readPlan(file);
      if (!flags.has("yes")) {
        const reserveIds = plan.schedule.days.flatMap((day) => day.items).filter((item) => item.action === "reserve");
        process.stdout.write(
          `Dry run: ${reserveIds.length} sessions would be reserved, ` +
            `${plan.schedule.days.flatMap((day) => day.items).filter((item) => item.action.startsWith("favorite")).length} favourited.\n` +
            "Re-run with --yes to apply.\n",
        );
        return 0;
      }
      await getValidTokens();
      const client = buildClient(false, config.eventId);
      const items = plan.schedule.days.flatMap((day) => day.items);
      const reserveIds = items
        .filter((item) => item.action === "reserve" && item.sessionId !== undefined)
        .map((item) => item.sessionId as string);
      const favouriteIds = items
        .filter((item) => item.action.startsWith("favorite") && item.sessionId !== undefined)
        .map((item) => item.sessionId as string);

      if (reserveIds.length > 0) {
        const reserved = await client.reserveThenVerify(reserveIds);
        process.stdout.write(`Reserved and verified: ${reserved.held.length}/${reserveIds.length}\n`);
        for (const failure of reserved.result.outcome.failed) {
          process.stdout.write(`  failed ${failure.sessionId}: ${failure.reason ?? "unknown"}\n`);
        }
      }
      if (favouriteIds.length > 0) {
        const favourited = await client.associateFavorites(favouriteIds);
        process.stdout.write(`Favourited: ${favourited.outcome.succeeded.length}/${favouriteIds.length}\n`);
      }
      return 0;
    }

    case "export": {
      const file = flags.get("file");
      if (typeof file !== "string") throw new Error("usage: repo-invent export --file <plan.json> [--out <dir>]");
      const plan = readPlan(file);
      const outDir = typeof flags.get("out") === "string" ? String(flags.get("out")) : ".";
      for (const path of writeExports(plan, outDir)) process.stdout.write(`wrote ${path}\n`);
      return 0;
    }

    case "mcp": {
      const { createServer } = await import("./mcp-server.js");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      await createServer().connect(new StdioServerTransport());
      return new Promise<number>(() => 0);
    }

    case "audit": {
      const client = buildClient(flags.has("offline"), config.eventId);
      const report = await client.audit();
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return 0;
    }

    default: {
      process.stderr.write(redact(`unknown command: ${command}\n`) + "\n");
      process.stdout.write(HELP);
      return 2;
    }
  }
}

run(process.argv.slice(2))
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unexpected failure";
    process.stderr.write(redact(message) + "\n");
    process.exitCode = 1;
  });
