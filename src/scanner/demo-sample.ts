import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoSnapshot } from "../types.js";

// The files the sample repository ships, in the order the scanner would rank
// them. Reading them at run time keeps the bundle and the sample identical.
const SAMPLE_FILES = ["package.json", "infra/main.tf", "src/orders.js", "src/server.js"];

function sampleDir(): string {
  const here = import.meta.url.startsWith("file:")
    ? dirname(fileURLToPath(import.meta.url))
    : dirname(import.meta.url);
  // src/scanner/demo-sample.ts -> ../../demo-sample; dist/scanner -> ../../demo-sample
  return join(here, "..", "..", "demo-sample");
}

/**
 * The bundled demo repository.
 *
 * Shipping the files rather than a hand-written JSON copy keeps the sample
 * honest: the scanner reads exactly what a reader would see on GitHub, so every
 * gap it reports is reproducible from the repository that ships beside it.
 */
export function sampleSnapshot(): RepoSnapshot | null {
  const dir = sampleDir();
  const manifests: Record<string, string> = {};
  let bytes = 0;
  for (const path of SAMPLE_FILES) {
    try {
      const content = readFileSync(join(dir, path), "utf8");
      manifests[path] = content;
      bytes += Buffer.byteLength(content, "utf8");
    } catch {
      // A missing file simply means the scan sees less; it is not an error.
    }
  }
  if (Object.keys(manifests).length === 0) return null;
  const files = Object.keys(manifests).map((path) => ({
    path,
    size: Buffer.byteLength(manifests[path] ?? "", "utf8"),
  }));
  return {
    ref: { owner: "reprohackathon", repo: "reinvent-demo-shop" },
    defaultBranch: "main",
    languages: { JavaScript: 70, HCL: 30 },
    files,
    manifests,
    truncated: false,
    fetchedFiles: files.length,
    fetchedBytes: bytes,
  };
}
