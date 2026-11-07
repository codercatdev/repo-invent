import { loadConfig, loadFixture } from "./config";
import { AwsEventsClient } from "./api/events-client";
import { fetchRepo } from "./scanner/repo-fetch";
import { scanManifests } from "./scanner/manifest-parser";
import { scanIac, hasWildcardIam } from "./scanner/iac-parser";
import { buildFingerprint, diagnose } from "./scanner/diagnostics";
import { prescribe } from "./solver/scorer";
import { DEMO_REPO, isDemoRepo } from "./scanner/demo-snapshot";
import { sampleSnapshot } from "./scanner/demo-sample";
import type { ArchitecturalGap, Catalog, PrescriptionPlan, StackFingerprint } from "./types";
import type { RepoSnapshot } from "./types";

/**
 * Scanning a repository, without an HTTP server around it.
 *
 * This lived inside `web.ts`, which also imports `node:http`. Splitting it out
 * lets a framework route (Next, Lambda, a test) import the scan without pulling
 * in the server, and keeps one implementation for every caller.
 */

// The last successful snapshot of the demo repo, so a repeat view during a
// rate limit shows the same data rather than the recorded copy.
let demoSnapshotCache: RepoSnapshot | undefined;

const WEB_FRAMEWORKS = new Set([
  "Express",
  "Fastify",
  "Koa",
  "Hapi",
  "NestJS",
  "Django",
  "Flask",
  "FastAPI",
  "Gin",
  "Axum",
]);

/** True for the bundled sample repository, whose files ship with the app. */
function isSampleRepo(url: string): boolean {
  return url.startsWith("sample://") || /reinvent-demo-shop/iu.test(url);
}

export interface ScanResponse {
  fingerprint: StackFingerprint;
  gaps: ArchitecturalGap[];
  schedule: { days: Array<{ date: string; items: unknown[] }> };
  plan: { remediation: { tickets: unknown[] } };
  catalogSource: "live" | "fixture";
  /** The whole catalog, so the page can draw availability the plan does not use. */
  sessions: unknown[];
  /** Where the repository data came from: live GitHub, this process' cache, or the recorded demo copy. */
  snapshotSource: "live" | "cached" | "recorded";
}

/**
 * One scan, for the web page.
 *
 * The page is a demo surface: it reads a public repository and plans against
 * the fixture catalog by default, so it needs no account and writes nothing.
 * Setting REPO_INVENT_LIVE_CATALOG=1 plans against the signed-in live catalog
 * instead, which needs a token on this machine.
 */
/**
 * Scan a repository and render the take-home report as one HTML page.
 *
 * Sharing the scan with `scanForWeb` is what keeps the report and the site
 * showing the same answer for the same repository.
 */
export async function renderReportFor(repo: string): Promise<string> {
  const result = await scanForPrescription(repo);
  const { renderReportHtml } = await import("./report");
  return renderReportHtml(result);
}

async function scanForPrescription(repo: string): Promise<PrescriptionPlan> {
  const config = loadConfig();
  // The bundled sample never touches the network: its files ship with the app.
  const bundled = isSampleRepo(repo) ? sampleSnapshot() : null;
  const result =
    bundled !== null
      ? null
      : await fetchRepo(repo, config.githubToken === undefined ? {} : { token: config.githubToken });
  let snapshot;
  if (bundled !== null) {
    snapshot = bundled;
  } else if (result !== null && !result.ok) {
    if (result.error.kind === "rate_limited" && isDemoRepo(repo)) {
      snapshot = demoSnapshotCache ?? DEMO_REPO.snapshot;
    } else {
      throw new Error(`${result.error.message}`);
    }
  } else if (result !== null) {
    snapshot = result.snapshot;
    if (isDemoRepo(repo)) demoSnapshotCache = result.snapshot;
  } else {
    throw new Error("could not read the repository");
  }

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
  const useLive = process.env["REPO_INVENT_LIVE_CATALOG"] === "1";
  const client = new AwsEventsClient({
    eventId: config.eventId,
    ...(useLive ? {} : { fixture: loadFixture() as unknown as Catalog }),
  });
  const catalog = await client.listSessions({ includeAbstracts: false });
  return prescribe(catalog, fingerprint, gaps);
}

export async function scanForWeb(repo: string): Promise<ScanResponse> {
  const config = loadConfig();
  const result = await fetchRepo(
    repo,
    config.githubToken === undefined ? {} : { token: config.githubToken },
  );

  // A rate limit on the demo repository falls back to the recorded snapshot,
  // so a judge who lands during the hourly window still sees a real result. Any
  // other failure is reported, because a silent substitute would be a lie.
  // A rate limit on the demo repository falls back, first to a snapshot this
  // process already fetched, then to the recorded one. Any other failure is
  // reported: a silent substitute for an arbitrary repo would be a false result.
  let snapshot;
  let servedFrom: "live" | "cached" | "recorded" = "live";
  if (!result.ok) {
    if (result.error.kind === "rate_limited" && isDemoRepo(repo)) {
      snapshot = demoSnapshotCache ?? DEMO_REPO.snapshot;
      servedFrom = demoSnapshotCache ? "cached" : "recorded";
    } else if (isSampleRepo(repo)) {
      // The bundled sample is shipped with the app, so it never needs the
      // network at all: a judge can always see the full story.
      const bundled = sampleSnapshot();
      if (bundled === null) throw new Error(`${result.error.message}`);
      snapshot = bundled;
      servedFrom = "recorded";
    } else {
      throw new Error(`${result.error.message}`);
    }
  } else {
    snapshot = result.snapshot;

    if (isDemoRepo(repo)) demoSnapshotCache = result.snapshot;
  }
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

  const useLive = process.env["REPO_INVENT_LIVE_CATALOG"] === "1";
  const client = new AwsEventsClient({
    eventId: config.eventId,
    ...(useLive ? {} : { fixture: loadFixture() as unknown as Catalog }),
  });
  const catalog = await client.listSessions({ includeAbstracts: false });
  const prescription = prescribe(catalog, fingerprint, gaps);

  return {
    fingerprint,
    gaps,
    schedule: { days: prescription.schedule.days },
    plan: { remediation: { tickets: prescription.remediation.tickets } },
    catalogSource: catalog.source,
    sessions: catalog.sessions,
    snapshotSource: servedFrom,
  };
}
