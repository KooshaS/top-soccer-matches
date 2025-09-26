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

async function autoScroll(page, ms = 2500) {
  const start = Date.now();
  let lastHeight = await page.evaluate(() => document.scrollingElement.scrollHeight);
  while (Date.now() - start < ms) {
    await page.evaluate(() => window.scrollBy(0, 900));
    await sleep(150); // <- use our own sleep
    const newHeight = await page.evaluate(() => document.scrollingElement.scrollHeight);
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
  }
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

    let names = [];

    for (const url of ECI_URLS) {
      try {
        console.log("[clubs] navigate:", url);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // Accept cookies if present
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button, a"))
            .filter(b => /accept|agree|ok|consent/i.test((b.textContent||"").trim()));
          btns.slice(0, 3).forEach(b => { try { b.click(); } catch {} });
        }).catch(() => {});

        await sleep(800);
        await autoScroll(page, 3000);

        // Strict row-based extractor
        names = await page.evaluate(() => {
          const BAD = /^(latest ranking|search|ranking|match odds|league odds|teams? comparison|methodology|disclaimer|contact|home|country|index|points?|position|rank)$/i;

          const canon = s =>
            (s || "")
              .toLowerCase()
              .replace(/\b(fc|cf|afc|sc)\b/g, "")
              .replace(/[^a-z0-9]+/g, " ")
              .trim();

          const out = [];
          const seen = new Set();

          let scopes = [];
          const heads = Array.from(document.querySelectorAll("h1,h2,h3"))
            .filter(h => /latest\s+ranking/i.test(h.textContent || ""));
          if (heads.length) {
            let n = heads[0].parentElement;
            if (n) scopes.push(n);
            let sib = heads[0].nextElementSibling;
            for (let i = 0; i < 4 && sib; i++, sib = sib.nextElementSibling) scopes.push(sib);
          }
          if (scopes.length === 0) scopes = [document.body];

          const takeFromRow = (row) => {
            const raw = (row.textContent || "").replace(/\s+/g, " ").trim();
            if (!/^\d+\b/.test(raw)) return; // must begin with numeric rank

            let name = "";
            const a = row.querySelector('a[href*="/club/"]');
            if (a) name = (a.textContent || "").replace(/\s+/g, " ").trim();

            if (!name) {
              let txt = raw.replace(/^\s*\d+\s*[-.]?\s*/, "").replace(/\s*\([^)]*\)\s*$/, "");
              const m = txt.match(/^[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'.-]+(?: [A-Z][A-Za-zÀ-ÖØ-öø-ÿ'.-]+){0,3}/);
              if (m) name = m[0];
            }

            if (!name || BAD.test(name)) return;
            const key = canon(name);
            if (!key || seen.has(key)) return;
            seen.add(key);
            out.push(name);
          };

          for (const scope of scopes) {
            const rows = scope.querySelectorAll("tr, li, [role='row']");
            for (const r of rows) {
              try { takeFromRow(r); } catch {}
              if (out.length >= 30) break;
            }
            if (out.length >= 25) break;
          }
          return out.slice(0, 25);
        });

        if (names.length >= 10) break;
        console.log("[clubs] extractor returned too few; trying next URL…");
      } catch (e) {
        console.warn("[clubs] navigate failed:", url, e.message);
      }
    }

    // Final de-dup + cap
    const dedup = [];
    const seen = new Set();
    for (const n of names) {
      const k = canon(n);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      dedup.push(n);
      if (dedup.length === 25) break;
    }
    return dedup;
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
