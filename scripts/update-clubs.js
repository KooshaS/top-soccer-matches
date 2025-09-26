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

const canon = s => (s||"").toLowerCase()
  .replace(/\b(fc|cf|afc|sc)\b/g,"")
  .replace(/[^a-z0-9]+/g," ").trim();

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  let last = await page.evaluate(() =>
    (document.scrollingElement?.scrollHeight || document.body.scrollHeight)
  );
  while (Date.now() - start < ms) {
    await page.evaluate(() => window.scrollBy(0, 900));
    await sleep(150);
    const cur = await page.evaluate(() =>
      (document.scrollingElement?.scrollHeight || document.body.scrollHeight)
    );
    if (cur === last) break;
    last = cur;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(600);
}

async function tryClickLoadMore(page, attempts = 3) {
  for (let clickCount = 0; clickCount < attempts; clickCount++) {
    const clicked = await page.evaluate((n) => {
      const pick = (sel) => Array.from(document.querySelectorAll(sel));
      const all = [
        ...pick("button"),
        ...pick("a"),
        ...pick("div[role='button']")
      ];
      const want = all.find(b => {
        const t = (b.textContent || "").trim().toLowerCase();
        return /load more|show more|show all|load all|complete list/.test(t);
      });
      if (want && typeof want.click === "function") { want.click(); return true; }
      // also try elements with aria-label
      const lab = all.find(b => {
        const t = (b.getAttribute("aria-label") || "").toLowerCase();
        return /load more|show more|show all|load all/.test(t);
      });
      if (lab && typeof lab.click === "function") { lab.click(); return true; }
      return false;
    }, clickCount);
    if (!clicked) return false;
    await sleep(1500); // wait for extra rows to render
  }
  return true;
}

function uniqTop25(pairs) {
  pairs.sort((a,b)=>a.rank-b.rank);
  const out=[], seen=new Set();
  for (const {name} of pairs) {
    const k = canon(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(name.trim());
    if (out.length === 25) break;
  }
  return out;
}

async function fetchTop25FromECI() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox","--disable-setuid-sandbox"],
    defaultViewport: { width: 1366, height: 2200 }
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    });

    for (const url of ECI_URLS) {
      try {
        console.log("[clubs] navigate:", url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await sleep(1200);

        // dismiss cookies if present
        await page.evaluate(() => {
          for (const el of document.querySelectorAll("button,a")) {
            const t = (el.textContent||"").trim().toLowerCase();
            if (/accept|agree|ok|consent/.test(t)) { try{ el.click(); }catch{} }
          }
        }).catch(()=>{});

        // load more content
        await tryClickLoadMore(page, 3);
        await autoScroll(page, 3500);

        // ===== 1) DOM-based extractor: rows that START with a rank =====
        const domPairs = await page.evaluate(() => {
          const pairs = [];
          const seen = new Set();
          const rows = document.querySelectorAll("tr, li, [role='row'], .ranking-row, .club-row");
          const BAD = /^(latest ranking|ranking|search|country|index|points?|position|rank)$/i;

          const grab = (row) => {
            const text = (row.textContent||"").replace(/\s+/g," ").trim();
            const m = text.match(/^\s*(\d{1,3})\s+([A-Za-zÀ-ÖØ-öø-ÿ'.\- ]{2,60})/);
            if (!m) return;
            const rank = Number(m[1]);
            if (!rank || rank > 200) return;
            // prefer anchor text if it links to /club/
            const a = row.querySelector('a[href*="/club/"]');
            const name = (a ? a.textContent : m[2]).replace(/\s*\([^)]*\)\s*$/,"").trim();
            if (!name || BAD.test(name)) return;
            const key = `${rank}|${name.toLowerCase()}`;
            if (seen.has(key)) return;
            seen.add(key);
            pairs.push({ rank, name });
          };

          for (const r of rows) { try { grab(r); } catch {} }
          return pairs;
        });

        if (domPairs.length >= 15) {
          const out = uniqTop25(domPairs);
          if (out.length >= 10) return out;
        }

        // ===== 2) Text-based fallback: lines that START with a rank =====
        const rawText = await page.evaluate(() => document.body.innerText || "");
        const lineRe = /^\s*(\d{1,3})\s+([A-Za-zÀ-ÖØ-öø-ÿ'.\- ]{2,60})(?:\s*\([^)]+\))?(?:\s+\d{3,5}.*)?$/gm;

        const tmp = [];
        let m;
        while ((m = lineRe.exec(rawText)) !== null) {
          const rank = Number(m[1]);
          const name = (m[2]||"").replace(/\s+/g," ").trim();
          if (!rank || !name) continue;
          if (/^(latest ranking|ranking|search|country|index|points?|position|rank)$/i.test(name)) continue;
          tmp.push({ rank, name });
        }

        const out = uniqTop25(tmp);
        if (out.length >= 10) return out;

        console.log("[clubs] extractor returned too few; trying next URL…");
      } catch (e) {
        console.warn("[clubs] navigate failed:", url, e.message);
      }
    }

    return [];
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
