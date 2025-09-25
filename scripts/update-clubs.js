/**
 * Update clubs.json with (approx.) top 30 European clubs from UEFA rankings page.
 * If the fetch/scrape fails, we keep the current clubs.json so the site still works.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CLUBS_PATH = path.join(ROOT, "clubs.json");
const UEFA_URL = "https://www.uefa.com/nationalassociations/uefarankings/club/";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const canon = (s) =>
  s.toLowerCase().replace(/\b(fc|cf|afc|sc)\b/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

async function readCurrentClubs() {
  try { return (JSON.parse(await fs.readFile(CLUBS_PATH, "utf8"))).clubs || []; }
  catch { return []; }
}
async function writeClubs(clubs) {
  await fs.writeFile(CLUBS_PATH, JSON.stringify({ clubs }, null, 2));
  console.log(`clubs.json updated (${clubs.length} clubs)`);
}

async function fetchUEFA() {
  const res = await fetch(UEFA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`UEFA fetch ${res.status}`);
  return await res.text();
}

function tryParseEmbeddedJSON(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    const json = JSON.parse(m[1]);
    const names = new Set();
    const walk = (v) => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === "object") {
        const n = v.clubName || v.teamName || v.name;
        if (typeof n === "string" && n.length <= 60) names.add(n.trim());
        for (const k in v) walk(v[k]);
      }
    };
    walk(json);
    return Array.from(names);
  } catch { return null; }
}

function tryParseFromTable(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&");
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);

  const candidates = [];
  for (const l of lines) {
    if (/\d/.test(l)) continue;
    if (l.length < 3 || l.length > 60) continue;
    if (/^(club|rank|coefficient|country|matches|points)$/i.test(l)) continue;
    if (/(fc|cf|sc|afc|real|city|united|atlet|borussia|bayern|psg|juventus|inter|milan|napoli|ajax|benfica|porto|leverkusen|leipzig|arsenal|chelsea|liverpool|barcelona|madrid)/i.test(l)) {
      candidates.push(l);
    }
  }
  const byCanon = new Map();
  for (const c of candidates) {
    const k = canon(c);
    if (k && !byCanon.has(k)) byCanon.set(k, c);
  }
  return Array.from(byCanon.values());
}

function pickTop30(names) {
  const cleaned = Array.from(new Set(names.map(n => n.trim()))).filter(n => n.length >= 3 && n.length <= 60);
  cleaned.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return cleaned.slice(0, 30);
}

async function main() {
  const current = await readCurrentClubs();
  try {
    const html = await fetchUEFA();
    let names = tryParseEmbeddedJSON(html);
    if (!names || names.length < 30) names = tryParseFromTable(html);
    if (!names || names.length < 10) {
      console.warn("UEFA parse weak; keeping existing clubs.json");
      if (current.length) return;
      // minimal fallback on brand-new repos
      return await writeClubs([
        "Real Madrid","Manchester City","Bayern Munich","Barcelona","Liverpool",
        "Arsenal","Paris Saint-Germain","Inter","AC Milan","Juventus",
        "Napoli","Atlético Madrid","Borussia Dortmund","RB Leipzig","Bayer Leverkusen",
        "Porto","Benfica","Sporting CP","Ajax","PSV","Feyenoord","Chelsea",
        "Tottenham","Aston Villa","Newcastle United","Sevilla","Roma","Lazio","Marseille","Monaco"
      ]);
    }
    await writeClubs(pickTop30(names));
  } catch (e) {
    console.error("UEFA fetch failed:", e.message);
    if (!current.length) {
      await writeClubs([
        "Real Madrid","Manchester City","Bayern Munich","Barcelona","Liverpool",
        "Arsenal","Paris Saint-Germain","Inter","AC Milan","Juventus",
        "Napoli","Atlético Madrid","Borussia Dortmund","RB Leipzig","Bayer Leverkusen",
        "Porto","Benfica","Sporting CP","Ajax","PSV","Feyenoord","Chelsea",
        "Tottenham","Aston Villa","Newcastle United","Sevilla","Roma","Lazio","Marseille","Monaco"
      ]);
    }
  }
}
await main();
