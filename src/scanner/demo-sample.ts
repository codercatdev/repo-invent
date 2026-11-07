import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoSnapshot } from "../types";

const SAMPLE_FILES = ["package.json", "infra/main.tf", "src/orders.js", "src/server.js"];

export function sampleSnapshot(): RepoSnapshot | null {
  const manifests: Record<string, string> = {};
  let bytes = 0;
  for (const path of SAMPLE_FILES) {
    try {
      const target = join(/*turbopackIgnore: true*/ process.cwd(), "demo-sample", path);
      const content = readFileSync(/*turbopackIgnore: true*/ target, "utf8");
      manifests[path] = content;
      bytes += Buffer.byteLength(content, "utf8");
    } catch {
      // Missing sample file
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
