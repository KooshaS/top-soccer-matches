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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  console.log(`[clubs] clubs.json updated (${clubs.length})`);
}

async function autoScroll(page, ms = 4000) {
  const start = Date.now();
  let last = await page.evaluate(() => document.scrollingElement.scrollHeight);
  while (Date.now() - start < ms) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(120);
    const cur = await page.evaluate(() => document.scrollingElement.scrollHeight);
    if (cur === last) break;
    last = cur;
  }
  // back to top so ranks 1..25 are in view
  await page.evaluate(() => window.scrollTo(0, 0));
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

    let pairs = []; // {rank, name}

    for (const url of ECI_URLS) {
      try {
        console.log("[clubs] navigate:", url);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // Dismiss cookie/consent if present
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button, a"))
            .filter(b => /accept|agree|ok|consent/i.test((b.textContent || "").trim()));
          btns.slice(0, 3).forEach(b => { try { b.click(); } catch {} });
        }).catch(() => {});

        // Let it render & trigger lazy load
        await sleep(1000);
        await autoScroll(page, 4500);

        // --- TEXT-BASED EXTRACTOR (markup-agnostic) ---
        const rawText = await page.evaluate(() => document.body.innerText || "");
        // Match lines like:
        //  1  Real Madrid (Spain)  4224 (+12)
        //  12 Newcastle United (England) 3545 (0)
        const lineRe = /^\s*(\d{1,3})\s+([A-Za-zÀ-ÖØ-öø-ÿ'.\- ]+?)(?:\s*\([^)]+\))?\s+\d{3,5}\b.*$/gm;

        const tmp = [];
        let m;
        while ((m = lineRe.exec(rawText)) !== null) {
          const rank = Number(m[1]);
          const name = m[2].replace(/\s+/g, " ").trim();
          if (!rank || !name) continue;
          // filter obvious non-club words
          if (/^(latest ranking|ranking|search|country|index|points?|position|rank)$/i.test(name)) continue;
          tmp.push({ rank, name });
        }

        // If still too few, try a looser pattern (rank + name only)
        if (tmp.length < 10) {
          const looseRe = /^\s*(\d{1,3})\s+([A-Za-zÀ-ÖØ-öø-ÿ'.\- ]{2,60})$/gm;
          let mm;
          while ((mm = looseRe.exec(rawText)) !== null) {
            const rank = Number(mm[1]);
            const name = mm[2].replace(/\s+/g, " ").trim();
            if (!rank || !name) continue;
            if (/^(latest ranking|ranking|search|country|index|points?|position|rank)$/i.test(name)) continue;
            tmp.push({ rank, name });
          }
        }

        // Deduplicate by rank & name, keep best 200 then sort
        const seen = new Set();
        for (const p of tmp) {
          const key = `${p.rank}|${canon(p.name)}`;
          if (!seen.has(key)) { pairs.push(p); seen.add(key); }
        }

        if (pairs.length >= 15) break; // we gathered enough; stop trying other URLs
      } catch (e) {
        console.warn("[clubs] navigate failed:", url, e.message);
      }
    }

    // Sort by rank and take unique names in order
    pairs.sort((a, b) => a.rank - b.rank);
    const names = [];
    const seenNames = new Set();
    for (const { name } of pairs) {
      const k = canon(name);
      if (!k || seenNames.has(k)) continue;
      seenNames.add(k);
      names.push(name);
      if (names.length === 25) break;
    }
    return names;
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
    if (!current.length) await writeClubs(SEED_25_CLUBS);
  }
})();
