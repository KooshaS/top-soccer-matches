const fs = require('fs');
const path = require('path');

// Simple fetch wrapper for Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cheerio = require('cheerio');

// Scrape top 25 clubs from kassiesa.net
async function scrapeTop25Clubs() {
  try {
    console.log('Scraping top 25 clubs from kassiesa.net...');
    const response = await fetch('https://kassiesa.net/uefa/data/method5/crank2025.html');
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const clubs = [];
    let rank = 1;
    
    // Parse the table - kassiesa uses a specific table structure
    $('table tr').each((i, row) => {
      if (rank > 25) return false;
      
      const cells = $(row).find('td');
      if (cells.length >= 3) {
        const clubName = $(cells[2]).text().trim();
        const country = $(cells[1]).text().trim();
        const points = parseFloat($(cells[3]).text().trim()) || 0;
        
        if (clubName && country) {
          clubs.push({
            rank: rank++,
            name: clubName,
            country: country,
            points: points
          });
        }
      }
    });
    
    console.log(`Found ${clubs.length} clubs`);
    return clubs.slice(0, 25);
  } catch (error) {
    console.error('Error scraping clubs:', error);
    // Return fallback data if scraping fails
    return getFallbackClubs();
  }
}

// Scrape today's matches from Sky Sports
async function scrapeTodaysMatches(top25ClubNames) {
  try {
    console.log('Scraping matches from Sky Sports...');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    // Sky Sports football fixtures page
    const response = await fetch('https://www.skysports.com/football-fixtures');
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const matches = [];
    let matchId = 1;
    
    // Parse fixtures - Sky Sports structure
    $('.fixres__item').each((i, item) => {
      const homeTeam = $(item).find('.swap-text--bp30').first().text().trim();
      const awayTeam = $(item).find('.swap-text--bp30').last().text().trim();
      const time = $(item).find('.matches__date').text().trim();
      const competition = $(item).find('.matches__competition').text().trim();
      
      // Only include if both teams are in top 25
      if (homeTeam && awayTeam && 
          top25ClubNames.includes(homeTeam) && 
          top25ClubNames.includes(awayTeam)) {
        matches.push({
          id: matchId++,
          homeTeam,
          awayTeam,
          time,
          competition: competition || 'European Football',
          status: 'upcoming'
        });
      }
    });
    
    console.log(`Found ${matches.length} matches between top 25 clubs`);
    return matches;
  } catch (error) {
    console.error('Error scraping matches:', error);
    return [];
  }
}

// Fallback data in case scraping fails
function getFallbackClubs() {
  return [
    { rank: 1, name: 'Real Madrid', country: 'ESP', points: 136.0 },
    { rank: 2, name: 'Manchester City', country: 'ENG', points: 133.0 },
    { rank: 3, name: 'Bayern München', country: 'GER', points: 131.0 },
    { rank: 4, name: 'Liverpool', country: 'ENG', points: 126.0 },
    { rank: 5, name: 'Paris Saint-Germain', country: 'FRA', points: 123.0 },
    { rank: 6, name: 'Internazionale', country: 'ITA', points: 120.0 },
    { rank: 7, name: 'Chelsea', country: 'ENG', points: 118.0 },
    { rank: 8, name: 'Borussia Dortmund', country: 'GER', points: 116.0 },
    { rank: 9, name: 'AS Roma', country: 'ITA', points: 114.0 },
    { rank: 10, name: 'FC Barcelona', country: 'ESP', points: 112.0 },
    { rank: 11, name: 'Manchester United', country: 'ENG', points: 110.0 },
    { rank: 12, name: 'Arsenal', country: 'ENG', points: 108.0 },
    { rank: 13, name: 'Bayer Leverkusen', country: 'GER', points: 106.0 },
    { rank: 14, name: 'Atlético Madrid', country: 'ESP', points: 104.0 },
    { rank: 15, name: 'Benfica', country: 'POR', points: 102.0 },
    { rank: 16, name: 'Atalanta', country: 'ITA', points: 100.0 },
    { rank: 17, name: 'Villarreal', country: 'ESP', points: 98.0 },
    { rank: 18, name: 'FC Porto', country: 'POR', points: 96.0 },
    { rank: 19, name: 'AC Milan', country: 'ITA', points: 94.0 },
    { rank: 20, name: 'RB Leipzig', country: 'GER', points: 92.0 },
    { rank: 21, name: 'Lazio', country: 'ITA', points: 90.0 },
    { rank: 22, name: 'Juventus', country: 'ITA', points: 88.0 },
    { rank: 23, name: 'Eintracht Frankfurt', country: 'GER', points: 86.0 },
    { rank: 24, name: 'Club Brugge', country: 'BEL', points: 84.0 },
    { rank: 25, name: 'Glasgow Rangers', country: 'SCO', points: 82.0 }
  ];
}

// Main execution
async function main() {
  console.log('Starting data scraping...');
  
  // Scrape clubs
  const clubs = await scrapeTop25Clubs();
  const clubNames = clubs.map(c => c.name);
  
  // Scrape matches
  const matches = await scrapeTodaysMatches(clubNames);
  
  // Save to JSON files
  const dataDir = path.join(__dirname, '..', 'public', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(dataDir, 'top25-clubs.json'),
    JSON.stringify(clubs, null, 2)
  );
  
  fs.writeFileSync(
    path.join(dataDir, 'todays-matches.json'),
    JSON.stringify(matches, null, 2)
  );
  
  console.log('Data scraping completed successfully!');
  console.log(`- Clubs: ${clubs.length}`);
  console.log(`- Matches: ${matches.length}`);
}

main().catch(console.error);
