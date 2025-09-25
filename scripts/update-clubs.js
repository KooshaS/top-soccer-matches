/**
 * Update clubs.json with the Top 30 clubs from FiveThirtyEight's SPI rankings (CSV).
 * - No API key / signup required.
 * - If the fetch or parse fails, keep the existing clubs.json.
 *
 * Source: https://projects.fivethirtyeight.com/soccer-api/club/spi_global_rankings.csv
 * (Attribution: FiveThirtyEight; CC BY 4.0. Add a short credit in README if you like.)
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CLUBS_PATH = path.join(ROOT, "clubs.json");
const SPI_CSV_URL = "https://projects.fivethirtyeight.com/soccer-api/club/spi_global_rankings.csv";

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

async function fetchSPI() {
  dbg("fetching SPI CSV:", SPI_CSV_URL);
  const res = await fetch(SPI_CSV_URL, {
    headers: {
      "User-Agent": "top-soccer-matches clubs-updater (no-key)",
      "Accept": "text/csv, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`SPI fetch ${res.status}`);
  return res.text();
}

/**
 * Parse the SPI CSV.
 * Typical columns include: rank, name, league, spi, off, def, etc.
 * We'll parse CSV leniently (no external deps), take rows with a 'name',
 * keep the first 30 by 'rank' order.
 */
function parseTop30FromCSV(csv) {
  // Split lines, find header
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idxRank = header.findIndex(h => /rank/i.test(h));
  const idxName = header.findIndex(h => /^name$/i.test(h));
  if (idxName === -1) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const name = cols[idxName]?.trim();
    if (!name) continue;

    // rank might be missing in some rows; use line order as fallback
    const rank = idxRank >= 0 ? Number(cols[idxRank]) : i;

    rows.push({ rank, name });
  }

  // sort by rank then take top 30
  rows.sort((a,b) => a.rank - b.rank);
  const names = rows.slice(0, 30).map(r => r.name);

  // Dedup & keep order
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const k = canon(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out.slice(0, 30);
}

/** Simple CSV splitter that respects basic quoted fields */
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const current = await readCurrent();

  try {
    const csv = await fetchSPI();
    const top30 = parseTop30FromCSV(csv);
    dbg("parsed names:", top30.length);

    if (top30.length < 10) {
      log("WARNING: SPI parsing returned too few clubs; keeping existing clubs.json");
      if (!current.length) {
        // first-run safety net
        await writeClubs([
          "Real Madrid","Manchester City","Bayern Munich","Barcelona","Liverpool",
          "Arsenal","Paris Saint-Germain","Inter","AC Milan","Juventus",
          "Napoli","Atlético Madrid","Borussia Dortmund","RB Leipzig","Bayer Leverkusen",
          "Porto","Benfica","Sporting CP","Ajax","PSV","Feyenoord","Chelsea",
          "Tottenham","Aston Villa","Newcastle United","Sevilla","Roma","Lazio","Marseille","Monaco"
        ]);
      }
      return;
    }

    // Only write if there is an actual change
    if (JSON.stringify(current) === JSON.stringify(top30)) {
      log("no change in clubs.json (same Top 30)");
      return;
    }
    await writeClubs(top30);
  } catch (e) {
    console.error("ERROR: SPI fetch/parse failed:", e.message);
    // keep existing file; do not fail the whole workflow
  }
}

await main();
