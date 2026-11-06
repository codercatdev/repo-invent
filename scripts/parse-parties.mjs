import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Parse the conferenceparties.com re:Invent 2026 page into structured data.
 *
 * The page is one TablePress table: a day header row, a column-header row, then
 * one row per event. Some rows are ad banners rather than events, and a sponsor
 * cell can carry a line break inside the name, so rows are read by column
 * position and anything without a time is dropped.
 *
 * Usage:
 *   node scripts/parse-parties.mjs <page.html> <out.json>
 */

const HTML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&#039;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&#8217;": "’",
  "&#8211;": "–",
  "&#8212;": "—",
  "&#038;": "&",
};

function decode(value) {
  let out = value;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  return out.replace(/&#(\d+);/g, (_all, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decode(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function clean(value) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

/** Split the sponsor cell into its parts; the page joins them with "&". */
function sponsorsOf(value) {
  return clean(value)
    .split(/\s*&\s*|\s*,\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** "6–8:30PM", "8AM–2PM", "5:30–9PM", "Evening" */
function parseTime(raw) {
  const text = raw.replace(/\u2013|\u2014/g, "-").trim();
  if (text.length === 0) return { start: null, end: null, label: "" };
  if (/^evening$/i.test(text)) return { start: null, end: null, label: "Evening" };

  const normalize = (fragment, fallbackMeridiem) => {
    const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(fragment.trim());
    if (match === null) return null;
    let hour = Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);
    const meridiem = (match[3] ?? fallbackMeridiem ?? "").toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (meridiem === "" && hour <= 7) hour += 12;
    return { hour, minute };
  };

  const parts = text.split("-");
  if (parts.length === 1) {
    const only = normalize(parts[0], null);
    return only === null
      ? { start: null, end: null, label: text }
      : { start: only, end: null, label: text };
  }
  const left = parts[0];
  const right = parts.slice(1).join("-");
  const rightMeridiem = /(AM|PM)/i.exec(right)?.[0] ?? null;
  const leftMeridiem = /(AM|PM)/i.exec(left)?.[0] ?? rightMeridiem;
  const start = normalize(left.replace(/(AM|PM)/i, ""), leftMeridiem);
  const end = right.trim().length === 0 ? null : normalize(right, rightMeridiem);
  return { start, end, label: text };
}

function toIso(date, time) {
  if (time === null) return null;
  const pad = (value) => (value < 10 ? `0${value}` : String(value));
  return `${date}T${pad(time.hour)}:${pad(time.minute)}:00`;
}

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

/** "Monday - November 30, 2026" */
function parseDayHeading(text) {
  const match = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (match === null) return null;
  const month = MONTHS[match[1]];
  if (month === undefined) return null;
  const pad = (value) => (value < 10 ? `0${value}` : String(value));
  return `${match[3]}-${pad(month)}-${pad(Number(match[2]))}`;
}

const ROW_RE = /<tr class="row-\d+[^"]*">([\s\S]*?)<\/tr>/g;
const CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (inputPath === undefined || outputPath === undefined) {
    process.stderr.write("usage: node scripts/parse-parties.mjs <page.html> <out.json>\n");
    process.exit(2);
  }

  const html = readFileSync(inputPath, "utf8");
  const parties = [];
  const seen = new Set();
  let currentDate = null;

  for (const row of html.matchAll(ROW_RE)) {
    const body = row[1] ?? "";

    // A day heading shares the row with no cells of its own.
    const heading = /<h2>([\s\S]*?)<\/h2>/.exec(body);
    if (heading !== null) {
      const date = parseDayHeading(clean(heading[1]));
      if (date !== null) currentDate = date;
      continue;
    }

    const cells = [...body.matchAll(CELL_RE)].map((cell) => cell[1] ?? "");
    if (cells.length < 4) continue;

    const [timeCell, sponsorCell, eventCell, locationCell, addedCell] = cells;
    if (timeCell === undefined || sponsorCell === undefined) continue;

    // A column-header row has "Time" in the first cell.
    const timeText = clean(timeCell);
    if (/^time$/i.test(timeText)) continue;

    const time = parseTime(timeText);
    const sponsors = sponsorsOf(sponsorCell);
    const linkMatch = /href="([^"]+)"/.exec(eventCell ?? "");
    const title = clean(eventCell ?? "")
      .replace(/Request an Invite/gi, "")
      .replace(/\s*-\s*$/g, "")
      .trim();

    // An ad banner row has no time and no title of its own.
    if (timeText.length === 0 || title.length === 0 || sponsors.length === 0) continue;
    if (currentDate === null) continue;

    const atCapacity = /at capacity/i.test(eventCell ?? "");
    const key = `${currentDate}|${timeText}|${title.toLowerCase()}|${sponsors.join(",").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    parties.push({
      date: currentDate,
      day: new Date(`${currentDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
      timeLabel: time.label,
      start: toIso(currentDate, time.start),
      end: toIso(currentDate, time.end),
      sponsors,
      title,
      url: linkMatch === null ? null : decode(linkMatch[1]),
      location: clean(locationCell ?? ""),
      added: clean(addedCell ?? ""),
      atCapacity,
    });

    void html;
  }

  parties.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return (left.start ?? "99").localeCompare(right.start ?? "99");
  });

  mkdirSync(outputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  const payload = {
    _notice:
      "Scraped from conferenceparties.com/reinvent2026/. Unofficial listing of vendor and community parties. Always confirm with the sponsor's own RSVP page.",
    source: "https://conferenceparties.com/reinvent2026/",
    scrapedAt: new Date().toISOString(),
    count: parties.length,
    days: [...new Set(parties.map((party) => party.date))],
    parties,
  };
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`parsed ${parties.length} parties across ${payload.days.length} days -> ${outputPath}\n`);
}

main();
