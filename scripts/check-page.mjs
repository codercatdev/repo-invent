import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/**
 * Load the real page in a DOM and report every runtime error.
 *
 * A blank screen with a 200 means the script threw while the tabs were still
 * hidden, so this runs the actual markup and script together and reports what
 * broke instead of guessing from the source.
 *
 * Usage: node scripts/check-page.mjs
 */

const html = new URL("../web/app.html", import.meta.url);
const source = readFileSync(html, "utf8");
const errors = [];

const dom = new JSDOM(source, {
  url: "http://localhost:8080/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.addEventListener("error", (event) => {
      errors.push(`${event.message} (line ${event.lineno})`);
    });
    window.fetch = async (url) => {
      const href = String(url);
      if (href.includes("/api/catalog")) {
        return { ok: true, json: async () => ({ count: 0, sessions: [] }) };
      }
      if (href.includes("/api/parties")) {
        return { ok: true, json: async () => ({ count: 0, parties: [] }) };
      }
      return { ok: false, json: async () => ({ error: "signed out" }) };
    };
  },
});

await new Promise((resolve) => setTimeout(resolve, 300));

const { document } = dom.window;
const errors2 = [...errors];
const hidden = [...document.querySelectorAll(".tabview")].filter((node) => node.hasAttribute("hidden"));
const shown = [...document.querySelectorAll(".tabview")].filter((node) => !node.hasAttribute("hidden"));

if (errors2.length > 0) {
  process.stdout.write(`page threw ${errors2.length} error(s):\n`);
  for (const line of errors2) process.stdout.write(`  ${line}\n`);
  process.exit(1);
}

process.stdout.write(`no errors; ${shown.length} tab shown, ${hidden.length} hidden\n`);
process.exit(shown.length === 1 ? 0 : 1);
