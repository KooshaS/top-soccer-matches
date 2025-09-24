# Top Soccer Matches — Today Only

A tiny static site that lists **today’s** top matches: if two clubs from your curated list play each other **today**, that match appears on the page.

## How it works
- `clubs.json` is your curated list.
- A GitHub Action runs daily, fetches **only today’s** fixtures (API-Football or football-data.org), filters to club-vs-club, and writes `data/topmatches.json` in this shape:
  ```json
  { "generated_at": "...", "date": "YYYY-MM-DD", "matches": [ ... ] }
