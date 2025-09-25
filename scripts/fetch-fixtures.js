/**
 * Fetch today's fixtures from OpenFootball (public JSON, no API key)
 * and write data/topmatches.json filtered by clubs.json.
 *
 * Sources (CC0, no key required):
 *   - https://github.com/openfootball/football.json  (season JSON files)
 *   - Docs + live JSON links via GitHub Pages
 *
 * Output shape:
 * {
 *   "generated_at": "<ISO>",
 *   "date": "YYYY-MM-DD",
 *   "matches": [{ competition, home, away, kickoff_utc, venue }]
 * }
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "topmatches.json");

// --- helpers ---------------------------------------------------------------
const canon = (s) =>
  s.toLowerCase()
    .replace(/\b(fc|cf|afc|sc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function loadClubSet() {
  const raw = await fs.readFile(path.join(ROOT, "clubs.json"), "utf8");
  const { clubs } = JSON.parse(raw);
  return new Set(clubs.map(canon));
}

// Season key like "2025-26" (rolls over in July)
function seasonKeyFor(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-12
  const start = m >= 7 ? y : y - 1;
  const endShort = String((start + 1) % 100).padStart(2, "0");
  return `${start}-${endShort}`;
}

function todayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "top-matches/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// --- main -----------------------------------------------------------------
async function main() {
  const dateKey = todayUTC();
  const season = seasonKeyFor();
  const clubs = await loadClubSet();

  // OpenFootball GitHub Pages JSON per league (see README for pattern)
  // Example in docs: openfootball.github.io/england/2025-26/1-premierleague.json
  // We'll pull the “big 5” leagues:
  const leagueFeeds = [
    { name: "Premier League", url: `https://openfootball.github.io/england/${season}/1-premierleague.json` },
    { name: "La Liga",        url: `https://openfootball.github.io/espana/${season}/1-laliga.json` },
    { name: "Serie A",        url: `https://openfootball.github.io/italy/${season}/1-seriea.json` },
    { name: "Bundesliga",     url: `https://openfootball.github.io/deutschland/${season}/1-bundesliga.json` },
    { name: "Ligue 1",        url: `https://openfootball.github.io/france/${season}/1-ligue1.json` },
  ];

  let matches = [];

  for (const lf of leagueFeeds) {
    try {
      const data = await fetchJson(lf.url);
      // Schema: { name, matches: [ { round, date: 'YYYY-MM-DD', team1, team2, score? } ] }
      const todays = (data.matches || []).filter(m => m.date === dateKey);
      for (const m of todays) {
        const home = m.team1;
        const away = m.team2;
        if (!home || !away) continue;
        // filter by your top-clubs list
        if (clubs.has(canon(home)) && clubs.has(canon(away))) {
          matches.push({
            competition: lf.name,
            home,
            away,
            kickoff_utc: null,   // OpenFootball fixtures are date-only; no official KO time
            venue: null
          });
        }
      }
    } catch (e) {
      console.warn(`Skipping ${lf.name}: ${e.message}`);
    }
  }

  // Sort by name for stable output (no times)
  matches.sort((a, b) => (a.home + a.away).localeCompare(b.home + b.away));

  const payload = {
    generated_at: new Date().toISOString(),
    date: dateKey,
    matches
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT} with ${matches.length} top matches for ${dateKey}`);
}

main().catch(err => { console.error(err); process.exit(1); });
