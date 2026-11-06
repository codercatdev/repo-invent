import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const html = readFileSync(new URL("../web/app.html", import.meta.url), "utf8");
const parts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const dir = mkdtempSync(join(tmpdir(), "appjs-"));
let failed = 0;
parts.forEach((body, index) => {
  const file = join(dir, `part${index}.js`);
  writeFileSync(file, body);
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
    process.stdout.write(`ok part${index} (${body.split("\n").length} lines)\n`);
  } catch {
    failed += 1;
    process.stdout.write(`FAIL part${index}\n`);
  }
});
process.exit(failed === 0 ? 0 : 1);
