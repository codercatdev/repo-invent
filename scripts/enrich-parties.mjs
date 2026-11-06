import { readFileSync, writeFileSync } from "node:fs";

/**
 * Add a clean venue tag and a map link to every party.
 *
 * The scraped `location` is free text: a venue name, a hotel, and sometimes a
 * street address run together ("Flight Club Palazzo, The Venetian"). This adds
 * three fields and leaves the original string alone:
 *
 *   venue     the best-known place name, for grouping and filtering
 *   address   a street address when one is present, else null
 *   mapUrl    a Google Maps search for whatever we know
 *
 * Usage: node scripts/enrich-parties.mjs data/parties.json
 */

const HOTELS = [
  "The Venetian",
  "Venetian",
  "Palazzo",
  "The Cosmopolitan",
  "Cosmopolitan",
  "Caesars Palace",
  "Bellagio",
  "Paris Hotel",
  "Paris",
  "Wynn",
  "Encore",
  "MGM Grand",
  "Aria",
  "Mandalay Bay",
  "Resorts World",
  "Circus Circus",
  "Luxor",
  "New York-New York",
  "The LINQ",
  "Flamingo",
  "Harrah's",
  "Planet Hollywood",
  "Sahara",
  "Westgate",
  "Park MGM",
  "Virgin Hotels",
];

/** A street address is a number followed by a street name. */
const ADDRESS = /\b(\d{3,5}\s+[A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.'-]*)*\s+(?:Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|St|Street|Ln|Lane|Pkwy|Parkway|Way)\b[^,;]*)/;

function venueOf(location) {
  const text = location.trim();
  if (/^register to see address/i.test(text)) return { venue: "Private venue", hidden: true };

  // The first comma-separated part usually holds the place and the hotel.
  const head = text.split(",")[0] ?? text;

  // Prefer a hotel name as the venue when it is the only landmark.
  const hotel = HOTELS.find((name) => new RegExp(`\\b${name.replace(/[-]/g, "\\-")}\\b`, "i").test(head));

  // Drop a trailing hotel so "SushiSAMBA The Venetian" reads "SushiSAMBA".
  let place = head;
  if (hotel !== undefined) {
    place = place.replace(new RegExp(`\\s*\\b${hotel.replace(/[-]/g, "\\-")}\\b\\s*`, "i"), " ").trim();
  }
  place = place.replace(ADDRESS, "").replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();

  // A place that is only an address, or empty, falls back to the hotel.
  const looksLikeAddress = place.length === 0 || /^\d/.test(place);
  const venue = looksLikeAddress ? (hotel ?? "Las Vegas") : place;
  return { venue, hidden: false };
}

function addressOf(location) {
  const match = ADDRESS.exec(location.replace(/^([^,]+,\s*)/, ""));
  return match === null ? null : match[1].replace(/\s+/g, " ").trim();
}

function main() {
  const path = process.argv[2] ?? "data/parties.json";
  const data = JSON.parse(readFileSync(path, "utf8"));

  for (const party of data.parties) {
    const { venue, hidden } = venueOf(party.location);
    const address = hidden ? null : addressOf(party.location);
    party.venue = venue;
    party.address = address;
    const query = encodeURIComponent(
      party.location && party.location !== "Vegas" ? `${party.location} Las Vegas` : "Las Vegas Convention Center",
    );
    party.mapUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  const venues = [...new Set(data.parties.map((party) => party.venue))];
  data.venueCount = venues.length;
  data.updatedAt = new Date().toISOString();

  const withAddress = data.parties.filter((party) => party.address !== null).length;
  const hidden = data.parties.filter((party) => party.venue === "Private venue").length;
  data.addressCount = withAddress;
  data.hiddenAddressCount = hidden;

  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  process.stdout.write(
    `enriched ${data.parties.length} parties: ${venues.length} venues, ${withAddress} with an address, ${hidden} private\n`,
  );
}

main();
