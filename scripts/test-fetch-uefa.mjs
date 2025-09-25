// Node 20+ on GitHub Actions. Manual test: fetch UEFA Top-25 clubs and print.
// Run only in Actions (no CORS there). Does NOT write clubs.json.
// Usage in workflow: node scripts/test-fetch-uefa.mjs

const UEFA_URL = "https://www.uefa.com/nationalassociations/uefarankings/club/";

const canon = (s) =>
  s.toLowerCase().replace(/\b(fc|cf|afc|sc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function uniqCap(arr, n = 25) {
  const seen = new Set(), out = [];
  for (const x of arr) {
    const k = canon(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
    if (out.length === n) break;
  }
  return out;
}

async function fetchUEFAHTML() {
  const res = await fetch(UEFA_URL, {
    headers: {
      "User-Agent": "top-soccer-matches test-fetch (no-key)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`UEFA HTTP ${res.status}`);
  return res.text();
}

// Try to read the embedded Next.js JSON (__NEXT_DATA__). This is the most stable path.
function extractFromNextData(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }

  const names = [];
  const walk = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === "string") {
          if (/^(clubName|teamName|name|club|team)$/i.test(k) && val.length >= 2 && val.length <= 60) {
            names.push(val);
          }
        } else if (val && (typeof val === "object" || Array.isArray(val))) {
          walk(val);
        }
      }
    }
  };
  walk(data);
  return uniqCap(names, 25);
}

// Very loose markup fallback in case the JSON isn’t present.
function fallbackFromMarkup(html) {
  const tableBlocks = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  let best = [];
  for (const tbl of tableBlocks) {
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const names = [];
    const seen = new Set();
    for (const row of rows) {
      if (!/<td[^>]*>\s*\d+\s*<\/td>/i.test(row)) continue; // numeric rank cell
      const a = row.match(/<a[^>]*>([^<]{2,80})<\/a>/i);
      if (!a) continue;
      const name = a[1].replace(/&amp;/g, "&").trim();
      const k = canon(name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      names.push(name);
    }
    if (names.length > best.length) best = names;
  }
  return best.slice(0, 25);
}

(async () => {
  try {
    const html = await fetchUEFAHTML();

    let top25 = extractFromNextData(html);
    if (top25.length < 10) {
      console.warn("Next-data parse returned too few; trying markup fallback…");
      top25 = fallbackFromMarkup(html);
    }
    if (!top25.length) throw new Error("No clubs parsed from UEFA.");

    console.log("UEFA Top 25 (test output):");
    top25.forEach((n, i) => console.log(String(i + 1).padStart(2, " "), n));
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
