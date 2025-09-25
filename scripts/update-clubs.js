/**
 * Update clubs.json with the Top 25 clubs from Wikipedia's
 * "UEFA club coefficient" page (no signup, public HTML).
 *
 * Safe behavior:
 * - If fetch/parse fails, keep the existing clubs.json.
 * - Only if no existing file, write a 25-club European seed list.
 * - Set DEBUG=1 in the workflow step to see verbose logs.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CLUBS_PATH = path.join(ROOT, "clubs.json");
const WIKI_URL = "https://en.wikipedia.org/wiki/UEFA_club_coefficient";
const DEBUG = process.env.DEBUG === "1";

const log = (...a) => console.log("[clubs]", ...a);
const dbg = (...a) => DEBUG && console.log("[clubs:dbg]", ...a);

const canon = (s) =>
  s.toLowerCase()
    .replace(/\b(fc|cf|afc|sc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function readCurrent() {
  try {
    const raw = await fs.readFile(CLUBS_PATH, "utf8");
    const clubs = JSON.parse(raw).clubs || [];
    log(`loaded existing clubs.json (${clubs.length})`);
    return clubs;
  } catch {
    log("no existing clubs.json; starting fresh");
    return [];
  }
}

async function writeClubs(clubs) {
  await fs.writeFile(CLUBS_PATH, JSON.stringify({ clubs }, null, 2));
  log(`clubs.json updated (${clubs.length} clubs)`);
}

async function fetchWikiHTML() {
  const res = await fetch(WIKI_URL, {
    headers: {
      "User-Agent": "top-soccer-matches clubs-updater (no-key)",
      "Accept": "text/html, */*",
    },
  });
  if (!res.ok) throw new Error(`Wikipedia fetch ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Parse Top 25 club names from the club coefficient table.
 * Heuristics:
 *  - Find wikitable(s) whose header row contains "Club" (and usually "Pos"/"Rank"/"Points").
 *  - For each data row: first <td> with a number (rank), then the first <a> text is the club.
 *  - De-dup, keep order, return first 25.
 */
function parseTop25FromWikipedia(html) {
  const tables = [];
  const tableRe = /<table[^>]*class="[^"]*\bwikitable\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = tableRe.exec(html))) tables.push(m[1]);
  dbg("wikitable count:", tables.length);

  const headerCells = (tableHtml) => {
    const headerRow = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? "";
    return Array.from(headerRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((x) =>
      x[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    );
  };

  let candidate = null;
  for (const t of tables) {
    const heads = headerCells(t);
    if (heads.some((h) => /club/.test(h)) && heads.some((h) => /(pos|rank|points?)/.test(h))) {
      candidate = t;
      break;
    }
  }
  if (!candidate && tables.length) candidate = tables[0];
  if (!candidate) return [];

  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(candidate))) {
    const row = r[1];
    if (!/\b<td[^>]*>\s*\d+\s*<\/td>/i.test(row)) continue;
    const clubMatch = row.match(/<a [^>]*?href="\/wiki\/[^"]+"[^>]*>([^<]{2,80})<\/a>/i);
    if (!clubMatch) continue;
    const name = clubMatch[1].replace(/&amp;/g, "&").trim();
    if (name && !/club|country|coefficient/i.test(name)) rows.push(name);
  }

  const seen = new Set();
  const out = [];
  for (const n of rows) {
    const k = canon(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
    if (out.length === 25) break;
  }
  return out;
}

// Strict 25-club European seed for first run (only used if no clubs.json yet)
const EUROPE_TOP25_SEED = [
  "Real Madrid",
  "Manchester City",
  "Bayern Munich",
  "Barcelona",
  "Liverpool",
  "Arsenal",
  "Paris Saint-Germain",
  "Inter",
  "AC Milan",
  "Juventus",
  "Napoli",
  "Atlético Madrid",
  "Borussia Dortmund",
  "RB Leipzig",
  "Bayer Leverkusen",
  "Porto",
  "Benfica",
  "Sporting CP",
  "Ajax",
  "PSV",
  "Feyenoord",
  "Chelsea",
  "Tottenham",
  "Roma",
  "Sevilla"
];

async function main() {
  const current = await readCurrent();

  try {
    const html = await fetchWikiHTML();
    const top25 = parseTop25FromWikipedia(html);
    dbg("parsed from Wikipedia:", top25.length, top25.slice(0, 8));

    if (top25.length < 15) {
      log("WARNING: Wikipedia returned too few clubs; keeping existing clubs.json");
      if (!current.length) await writeClubs(EUROPE_TOP25_SEED);
      return;
    }

    if (JSON.stringify(current) === JSON.stringify(top25)) {
      log("no change in clubs.json (same Top 25)");
      return;
    }
    await writeClubs(top25);
  } catch (e) {
    console.error("ERROR: Wikipedia fetch/parse failed:", e.message);
    if (!current.length) {
      log("writing European Top-25 seed list");
      await writeClubs(EUROPE_TOP25_SEED);
    }
    // else: keep existing file
  }
}

await main();
