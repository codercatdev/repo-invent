import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanManifests } from "../src/scanner/manifest-parser.js";
import { scanIac, hasWildcardIam } from "../src/scanner/iac-parser.js";
import { buildFingerprint, diagnose } from "../src/scanner/diagnostics.js";
import type { RepoSnapshot } from "../src/types.js";

const FILES = ["package.json", "infra/main.tf", "src/orders.js", "src/server.js"];

function files(): string[] {
  return FILES;
}

function snapshot(): RepoSnapshot {
  const manifests: Record<string, string> = {};
  for (const path of files()) manifests[path] = readFileSync(`demo-sample/${path}`, "utf8");
  return {
    ref: { owner: "demo", repo: "reinvent-demo-shop" },
    defaultBranch: "main",
    languages: { JavaScript: 100 },
    files: files().map((path) => ({ path, size: 100 })),
    manifests,
    truncated: false,
    fetchedFiles: files().length,
    fetchedBytes: 10_000,
  };
}

describe("the demo sample repository", () => {
  it("diagnoses every gap the demo page is meant to show", () => {
    const snap = snapshot();
    const manifestScan = scanManifests(snapshot());
    const iacScan = scanIac(snapshot());
    const fingerprint = buildFingerprint({ snapshot: snap, manifestScan, iacScan });
    const gaps = diagnose({
      fingerprint,
      iacScan,
      snapshot: snapshot(),
      wildcardIam: hasWildcardIam(snapshot()),
      hasWebFramework: true,
    });
    const ids = gaps.map((gap) => gap.id);

    expect(fingerprint.services.map((service) => service.service)).toContain("DynamoDB");
    expect(gaps.length).toBeGreaterThanOrEqual(5);
    expect(ids).toContain("dynamodb-without-resilience");
    expect(ids).toContain("compute-without-observability");
    expect(ids).toContain("wildcard-iam");
    expect(ids).toContain("public-api-without-waf");
    for (const gap of gaps) {
      expect(gap.evidence.length).toBeGreaterThan(0);
    }
  });
});
