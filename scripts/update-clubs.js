// Update clubs.json using EuroClubIndex (HTTPS) via headless Chromium in GitHub Actions.
// - Runs Puppeteer, renders the page, extracts Top-25 club names, writes clubs.json.
// - If parsing fails, keeps your current clubs.json (and seeds if none exists).

import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = process.cwd();
const CLUBS_PATH = path.join(ROOT, "clubs.json");

const ECI_URLS = [
  "https://www.euroclubindex.com/rankings",
  "https://www.euroclubindex.com/"
];

const SEED_25_CLUBS = [
  "Real Madrid","Manchester City","Bayern Munich","Barcelona","Liverpool",
  "Arsenal","Paris Saint-Germain","Inter","AC Milan","Juventus",
  "Napoli","Atlético Madrid","Borussia Dortmund","RB Leipzig","Bayer Leverkusen",
  "Porto","Benfica","Sporting CP","Ajax","PSV",
  "Feyenoord","Chelsea","Tottenham Hotspur","Roma","Sevilla"
];

const canon = s =>
  (s || "")
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function readCurrent() {
  try {
    const raw = await fs.readFile(CLUBS_PATH, "utf8");
    const clubs = JSON.parse(raw).clubs || [];
    console.log(`[clubs] loaded existing clubs.json (${clubs.length})`);
    return clubs;
  } catch {
    console.log("[clubs] no existing clubs.json; starting fresh");
    return [];
  }
}

async function writeClubs(clubs) {
  await fs.writeFile(CLUBS_PATH, JSON.stringify({ clubs }, null, 2));
  console.log(`[clubs] clubs.json updated (${clubs.length} clubs)`);
}

async function fetchTop25FromECI() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1366, height: 2200 }
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/123.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let names = [];

    for (const url of ECI_URLS) {
      try {
        console.log("[clubs] navigate:", url);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // Dismiss cookie/consent banners if present
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button, a"))
            .filter(b => /accept|agree|ok|consent/i.test((b.textContent || "").trim()));
          btns.slice(0, 3).forEach(b => { try { b.click(); } catch {} });
        }).catch(() => {});

        // Give the page a moment to render the ranking list
        await sleep(1500);

        // Primary extraction: /club/ links in the main ranking area
        names = await page.$$eval('a[href*="/club/"]', as => {
          const canon = s => (s||"").toLowerCase().replace(/\b(fc|cf|afc|sc)\b/g,"")
            .replace(/[^a-z0-9]+/g," ").trim();
          const out = [], seen = new Set();
          for (const a of as) {
            const n = (a.textContent || "").replace(/\s+/g," ").trim();
            if (!n) continue;
            if (/^(rank|position|points?|index|country|search)$/i.test(n)) continue;
            const k = canon(n);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(n);
            if (out.length === 25) break;
          }
          return out;
        });

        // Secondary fallback: scan visible rows/text if link query was too sparse
        if (names.length < 10) {
          const extra = await page.evaluate(() => {
            const canon = s => (s||"").toLowerCase().replace(/\b(fc|cf|afc|sc)\b/g,"")
              .replace(/[^a-z0-9]+/g," ").trim();
            const out = [], seen = new Set();
            const rows = Array.from(document.querySelectorAll("tr, li, div"));
            for (const el of rows) {
              const txt = (el.textContent || "").replace(/\s+/g," ").trim();
              if (!txt) continue;
              const m = txt.match(/[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'.-]+(?: [A-Z][A-Za-zÀ-ÖØ-öø-ÿ'.-]+){0,3}/g) || [];
              for (const cand of m) {
                if (/^(Rank|Position|Country|Points?|Index|Search)$/i.test(cand)) continue;
                const k = canon(cand);
                if (!k || seen.has(k)) continue;
                seen.add(k);
                out.push(cand);
                if (out.length === 25) break;
              }
              if (out.length === 25) break;
            }
            return out;
          });
          const set = new Set(names.map(n => n.toLowerCase()));
          for (const n of extra) {
            const k = n.toLowerCase();
            if (!set.has(k)) { names.push(n); set.add(k); }
            if (names.length === 25) break;
          }
        }

        if (names.length >= 10) break; // success on this URL
      } catch (e) {
        console.warn("[clubs] navigate failed:", url, e.message);
      }
    }

    return names.slice(0, 25);
  } finally {
    await browser.close();
  }
}

(async () => {
  const current = await readCurrent();
  try {
    const top25 = await fetchTop25FromECI();
    console.log("[clubs] parsed:", top25.length, "clubs");
    if (top25.length < 10) {
      console.warn("[clubs] WARNING: too few clubs parsed; keeping existing clubs.json");
      if (!current.length) await writeClubs(SEED_25_CLUBS);
      process.exit(0);
    }
    if (JSON.stringify(current) === JSON.stringify(top25)) {
      console.log("[clubs] no change (same Top 25)");
      process.exit(0);
    }
    await writeClubs(top25);
  } catch (e) {
    console.error("[clubs] ERROR:", e.message);
    if (!current.length) await writeClubs(SEED_25_CLUBS); // seed on first run
    process.exit(0);
  }
})();
