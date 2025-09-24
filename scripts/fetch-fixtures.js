/**
 * Today-only fixtures filtered to matches where BOTH teams are in clubs.json.
 * Supports API-Football (RapidAPI) OR football-data.org. Configure one via env.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function canon(s) {
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadClubs() {
  const raw = await fs.readFile(path.join(ROOT, 'clubs.json'), 'utf8');
  const { clubs } = JSON.parse(raw);
  const set = new Set(clubs.map(canon));
  return { clubs, set };
}

function todayKeyUTC() {
  const d = new Date();
  d.setUTCHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

async function fetchFixturesForDate(dateKey) {
  if (process.env.RAPIDAPI_KEY) return fetchFromApiFootball(dateKey);
  if (process.env.FOOTBALL_DATA_KEY) return fetchFromFootballData(dateKey);
  throw new Error('No API credentials found. Set RAPIDAPI_KEY or FOOTBALL_DATA_KEY.');
}

async function fetchFromApiFootball(dateKey) {
  const url = `https://v3.football.api-sports.io/fixtures?date=${dateKey}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    }
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const json = await res.json();
  return json.response.map(x => ({
    competition: x.league?.name || null,
    home: x.teams?.home?.name,
    away: x.teams?.away?.name,
    kickoff_utc: x.fixture?.date || null,
    venue: x.fixture?.venue?.name || null
  }));
}

async function fetchFromFootballData(dateKey) {
  const comps = [2002, 2014, 2015, 2019, 2021, 2024, 2017, 2016];
  const headers = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };
  const out = [];
  for (const c of comps) {
    const url = `https://api.football-data.org/v4/competitions/${c}/matches?dateFrom=${dateKey}&dateTo=${dateKey}`;
    const res = await fetch(url, { headers });
    if (res.status === 429) { await sleep(1000); continue; }
    if (!res.ok) continue;
    const json = await res.json();
    for (const m of (json.matches || [])) {
      out.push({
        competition: json.competition?.name || m.competition?.name || null,
        home: m.homeTeam?.name,
        away: m.awayTeam?.name,
        kickoff_utc: m.utcDate || null,
        venue: null
      });
    }
  }
  return out;
}

async function main() {
  const { set } = await loadClubs();
  const date = todayKeyUTC();
  let fixtures = [];
  try {
    fixtures = await fetchFixturesForDate(date);
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
  const matches = (fixtures || []).filter(m => set.has(canon(m.home)) && set.has(canon(m.away)))
    .sort((a,b) => (a.kickoff_utc || '').localeCompare(b.kickoff_utc || ''));

  const payload = { generated_at: new Date().toISOString(), date, matches };

  const outDir = path.join(ROOT, 'data');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'topmatches.json'), JSON.stringify(payload, null, 2));
  console.log('Wrote data/topmatches.json for', date);
}

main().catch(err => { console.error(err); process.exit(1); });
