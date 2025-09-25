/**
 * Update clubs.json with the Top 30 clubs from FiveThirtyEight's SPI rankings (CSV).
 * Source (stable, no redirects, no signup):
 *   https://raw.githubusercontent.com/fivethirtyeight/data/master/soccer-spi/spi_global_rankings.csv
 *
 * If fetch/parse fails, keeps the existing clubs.json so the site still works.
 * Optional verbose logs: set env DEBUG=1
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CLUBS_PATH = path.join(ROOT, "clubs.json");
const SPI_CSV_URL = "https://raw.githubusercontent.com/fivethirtyeight/data/master/soccer-spi/spi_global_rankings.csv";
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
  const res = await fetch(SPI_CSV_URL, {
    headers: {
      "User-Agent": "top-soccer-matches clubs-updater (no-key)",
      "Accept": "text/csv, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`SPI fetch ${res.status} ${res.statusText}`);
  return res.text();
}

/** Split one CSV line, handling quotes/doubled quotes. */
function splitCSV(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; }
    } else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Find header row & the indexes for rank + name columns. */
function locateHeader(lines) {
  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const cols = splitCSV(lines[i]);
    const lower = cols.map((c) => c.trim().toLowerCase());
    const idxName = lower.findIndex((h) => h === "name" || h === "team" || h === "club");
    const idxRank = lower.findIndex((h) => h === "rank" || h === "global_rank" || h === "position");
    if (idxName !== -1) return { headerIndex: i, idxName, idxRank };
  }
  // Fallback: assume first row is header, name at 1, rank at 0
  return { headerIndex: 0, idxName: 1, idxRank: 0 };
}

function parseTop30(csv) {
  // Normalize and strip BOM if present
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const { headerIndex, idxName, idxRank } = locateHeader(lines);
  dbg("headerIndex:", headerIndex, "idxName:", idxName, "idxRank:", idxRank);

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCSV(lines[i]);
    const name = (cols[idxName] || "").trim();
    if (!name) continue;

    let rank = i; // fallback to line order
    if (idxRank >= 0 && idxRank < cols.length) {
      const r = Number((cols[idxRank] || "").trim());
      if (!Number.isNaN(r)) rank = r;
    }
    rows.push({ rank, name });
  }

  rows.sort((a, b) => a.rank - b.rank);

  // Dedup by canonical name; keep first 30
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = canon(r.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r.name);
    if (out.length === 30) break;
  }
  return out;
}

async function main() {
  const current = await readCurrent();

  try {
    const csv = await fetchSPI();
    const top30 = parseTop30(csv);
    dbg("parsed count:", top30.length, "sample:", top30.slice(0, 5));

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

    if (JSON.stringify(current) === JSON.stringify(top30)) {
      log("no change in clubs.json (same Top 30)");
      return;
    }
    await writeClubs(top30);
  } catch (e) {
    console.error("ERROR: SPI fetch/parse failed:", e.message);
    // keep existing file; do not fail job
  }
}

await main();
