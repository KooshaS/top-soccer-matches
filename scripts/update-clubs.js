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
  let last = await page.evaluate(() => document.scrollingElement?.scrollHeight || document.body.scrollHeight);
  let scrollAttempts = 0;
  
  while (Date.now() - start < ms && scrollAttempts < 15) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(200);
    scrollAttempts++;
    
    const cur = await page.evaluate(() => document.scrollingElement?.scrollHeight || document.body.scrollHeight);
    if (cur === last) break;
    last = cur;
  }
  
  // back to top so ranks 1..25 are in view
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1000);
}

async function tryDOMExtraction(page) {
  try {
    // Try multiple DOM selectors for club rankings
    const clubs = await page.evaluate(() => {
      const results = [];
      
      // Method 1: Look for table rows or list items with ranking data
      const selectors = [
        'tr', 'li', '.ranking-row', '.club-row', '[data-rank]',
        '.team', '.club', '.ranking-item'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < Math.min(elements.length, 50); i++) {
          const el = elements[i];
          const text = el.textContent || '';
          
          // Look for patterns like "1. Real Madrid" or "Real Madrid 1"
          const rankMatch = text.match(/^\s*(\d{1,3})[.\s]+([A-Za-zÀ-ÖØ-öø-ÿ'.\-\s]{2,50})/);
          if (rankMatch) {
            const rank = parseInt(rankMatch[1]);
            const name = rankMatch[2].replace(/\s*\([^)]+\).*$/, '').trim();
            if (rank <= 100 && name.length > 1 && rank <= 30) { // Only keep ranks 1-30
              results.push({ rank, name, source: 'dom-' + selector });
            }
          }
        }
        
        if (results.length >= 15) break;
      }
      
      return results.slice(0, 30);
    });
    
    console.log(`[clubs] DOM extraction found ${clubs.length} potential clubs`);
    return clubs;
  } catch (e) {
    console.log(`[clubs] DOM extraction failed: ${e.message}`);
    return [];
  }
}

async function fetchTop25FromECI() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security"
    ],
    defaultViewport: { width: 1366, height: 2200 }
  });

  try {
    const page = await browser.newPage();
    
    // Better stealth settings
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ 
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    });

    let allPairs = []; // {rank, name, source}

    for (const url of ECI_URLS) {
      try {
        console.log("[clubs] navigate:", url);
        await page.goto(url, { 
          waitUntil: "domcontentloaded", 
          timeout: 30000 
        });

        // Wait a bit for initial render
        await sleep(2000);

        // Dismiss cookie/consent if present
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button, a, div"))
            .filter(b => /accept|agree|ok|consent|dismiss|close/i.test((b.textContent || "").trim()));
          btns.slice(0, 5).forEach(b => { 
            try { 
              if (b.click) b.click(); 
            } catch {} 
          });
        }).catch(() => {});

        await sleep(1500);

        // Click "Load more" button multiple times to get top 25 clubs
        console.log("[clubs] Looking for load more buttons to get top 25...");
        
        // First, let's see how many clubs are currently visible
        let visibleClubs = await page.evaluate(() => {
          const rankings = document.querySelectorAll('*');
          let count = 0;
          for (let el of rankings) {
            const text = el.textContent || '';
            if (/^\s*\d{1,2}\s+.*\d{4}\s*\(\s*[\+\-]?\d+\s*\)/.test(text)) {
              count++;
            }
          }
          return count;
        });
        console.log(`[clubs] Initially visible clubs: ${visibleClubs}`);
        
        // Click "Load more" button at least 2 times to get 30+ clubs displayed (10 initial + 10 + 10)
        for (let clickCount = 0; clickCount < 3; clickCount++) {
          const buttonInfo = await page.evaluate(() => {
            // Look for "Load more" button first
            const loadMoreBtn = Array.from(document.querySelectorAll("button, a, div"))
              .find(b => /load more.*\d+.*of.*\d+/i.test((b.textContent || "").trim()));
            
            if (loadMoreBtn) {
              const buttonText = loadMoreBtn.textContent;
              console.log("Found 'Load more' button:", buttonText);
              try {
                // Check if button is visible and clickable
                const rect = loadMoreBtn.getBoundingClientRect();
                if (rect.height === 0 || rect.width === 0) {
                  return { clicked: false, reason: 'Button not visible', text: buttonText };
                }
                
                loadMoreBtn.click();
                return { clicked: true, text: buttonText };
              } catch (e) {
                return { clicked: false, reason: e.message, text: buttonText };
              }
            }

            // Fallback: look for "Load complete list" button
            const loadCompleteBtn = Array.from(document.querySelectorAll("button, a, div"))
              .find(b => /load complete list|load all|show all/i.test((b.textContent || "").trim()));
            
            if (loadCompleteBtn && clickCount === 0) { // Only try complete on first attempt
              const buttonText = loadCompleteBtn.textContent;
              console.log("Found 'Load complete list' button");
              try {
                loadCompleteBtn.click();
                return { clicked: true, text: buttonText, type: 'complete' };
              } catch (e) {
                return { clicked: false, reason: e.message, text: buttonText };
              }
            }

            return { clicked: false, reason: 'No button found' };
          });

          console.log(`[clubs] Click attempt ${clickCount + 1}:`, buttonInfo);

          if (buttonInfo.clicked) {
            console.log(`[clubs] Successfully clicked: ${buttonInfo.text}`);
            await sleep(4000); // Wait longer for content to load
            
            // Check how many clubs are visible now
            visibleClubs = await page.evaluate(() => {
              const rankings = document.querySelectorAll('*');
              let count = 0;
              for (let el of rankings) {
                const text = el.textContent || '';
                if (/^\s*\d{1,2}\s+.*\d{4}\s*\(\s*[\+\-]?\d+\s*\)/.test(text)) {
                  count++;
                }
              }
              return count;
            });
            console.log(`[clubs] Clubs visible after click: ${visibleClubs}`);
            
            // If we clicked "Load complete list", we should be done
            if (buttonInfo.type === 'complete') {
              console.log("[clubs] Loaded complete list, should have all clubs now");
              break;
            }
            
            // If we have 25+ clubs visible, we can stop
            if (visibleClubs >= 25) {
              console.log(`[clubs] Got ${visibleClubs} clubs, enough for top 25!`);
              break;
            }
          } else {
            console.log(`[clubs] Click failed: ${buttonInfo.reason}`);
            break;
          }
          
          // Short pause between clicks
          await sleep(1500);
        }

        await autoScroll(page);

        // Method 1: Try DOM extraction first - but focus on top rankings
        const domClubs = await tryDOMExtraction(page);
        // Filter DOM results to only top 30 ranks
        const topDomClubs = domClubs.filter(club => club.rank <= 30);
        allPairs.push(...topDomClubs);

        // Method 2: Text-based extraction (your original method, but improved)
        const rawText = await page.evaluate(() => document.body.innerText || "");
        console.log(`[clubs] Page text length: ${rawText.length} chars`);
        
        // Debug: log first 1000 chars to see what we're getting
        console.log(`[clubs] Sample text: "${rawText.substring(0, 1000)}..."`);

        // More flexible regex patterns
        const patterns = [
          // "1  Real Madrid (Spain)  4224 (+12)"
          /^\s*(\d{1,3})\s+([A-Za-zÀ-ÖØ-öø-ÿ'.\-\s]{2,50})(?:\s*\([^)]+\))?\s+\d{3,5}\b.*$/gm,
          // "1. Real Madrid"
          /^\s*(\d{1,3})[.\s]+([A-Za-zÀ-ÖØ-öø-ÿ'.\-\s]{2,50})$/gm,
          // Just "1 Real Madrid" 
          /^\s*(\d{1,3})\s+([A-Za-zÀ-ÖØ-öø-ÿ'.\-\s]{2,50})$/gm,
          // Handle cases like "- Real Madrid" or "1 - Real Madrid"
          /^\s*(?:\d{1,3}\s*)?[-•]\s*([A-Za-zÀ-ÖØ-öø-ÿ'.\-\s]{2,50})$/gm,
          // Try to match ranking lines more aggressively
          /(\d{1,3})[\s.]+([A-Za-zÀ-ÖØ-öø-ÿ'.\-\s]{3,40})(?:\s*\([^)]*\))?/gm
        ];

        for (let i = 0; i < patterns.length; i++) {
          const pattern = patterns[i];
          let m;
          while ((m = pattern.exec(rawText)) !== null) {
            let rank, name;
            
            if (i === 3) { // Special handling for "- Club Name" pattern
              rank = 0; // We'll assign sequential ranks later
              name = m[1];
            } else {
              rank = Number(m[1]);
              name = m[2];
            }
            
            // Clean up the name - remove leading/trailing hyphens and extra spaces
            name = name.replace(/^[-•\s]+|[-•\s]+$/g, '').replace(/\s+/g, " ").trim();
            
            if (!name || (rank && rank > 30)) continue; // Only accept ranks 1-30 to focus on top clubs
            if (name.length < 3 || name.length > 50) continue;
            
            // filter obvious non-club words
            if (/^(latest ranking|ranking|search|country|index|points?|position|rank|table|season|year|month|day|time|club|team|football|soccer)$/i.test(name)) continue;
            
            allPairs.push({ rank: rank || allPairs.length + 1, name, source: `text-pattern-${i}` });
          }
          
          console.log(`[clubs] Pattern ${i} found ${allPairs.filter(p => p.source === `text-pattern-${i}`).length} matches`);
          if (allPairs.length >= 100) break; // Collect even more candidates
        }

        console.log(`[clubs] Total pairs found so far: ${allPairs.length}`);
        if (allPairs.length >= 30) break; // Collect more candidates before stopping
        
      } catch (e) {
        console.warn("[clubs] navigate failed:", url, e.message);
      }
    }

    if (allPairs.length === 0) {
      console.error("[clubs] No clubs found at all - website might have changed structure");
      return [];
    }

    // Sort by rank and take only the top 25 unique names
    allPairs.sort((a, b) => a.rank - b.rank);
    
    console.log("[clubs] Sample of found clubs (first 15):", 
      allPairs.slice(0, 15).map(p => `${p.rank}: ${p.name}`));
    
    const names = [];
    const seenNames = new Set();
    for (const { name, rank } of allPairs) {
      const k = canon(name);
      if (!k || seenNames.has(k)) continue;
      if (rank > 25) break; // Stop after rank 25
      seenNames.add(k);
      names.push(name);
      if (names.length === 25) break; // Stop after 25 clubs
    }
    
    console.log(`[clubs] Final unique clubs: ${names.length}`);
    console.log("[clubs] Top 25 clubs:", names.slice(0, 25));
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
    
    if (top25.length < 8) {
      console.warn("[clubs] WARNING: too few clubs parsed; keeping existing clubs.json");
      if (!current.length) {
        console.log("[clubs] Writing seed clubs as fallback");
        await writeClubs(SEED_25_CLUBS);
      }
      process.exit(0);
    }
    
    if (JSON.stringify(current) === JSON.stringify(top25)) {
      console.log("[clubs] no change (same Top 25)");
      process.exit(0);
    }
    
    await writeClubs(top25);
    
  } catch (e) {
    console.error("[clubs] ERROR:", e.message);
    console.error(e.stack);
    
    if (!current.length) {
      console.log("[clubs] Writing seed clubs due to error");
      await writeClubs(SEED_25_CLUBS);
    }
  }
})();
