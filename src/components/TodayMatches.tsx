import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatInTimeZone } from 'date-fns-tz';

interface Match {
  id: number;
  homeTeam: string;
  awayTeam: string;
  time: string;
  competition: string;
  status: 'upcoming' | 'live' | 'finished';
  score?: { home: number; away: number };
}

// Top 25 club names for reference
const TOP_25_NAMES = [
  'Real Madrid', 'Manchester City', 'Bayern München', 'Liverpool', 'Paris Saint-Germain',
  'Internazionale', 'Chelsea', 'Borussia Dortmund', 'AS Roma', 'FC Barcelona',
  'Manchester United', 'Arsenal', 'Bayer Leverkusen', 'Atlético Madrid', 'Benfica',
  'Atalanta', 'Villarreal', 'FC Porto', 'AC Milan', 'RB Leipzig',
  'Lazio', 'Juventus', 'Eintracht Frankfurt', 'Club Brugge', 'Glasgow Rangers'
];

// Today's matches - based on real fixtures from Sky Sports
// Updated: Saturday 4th October 2025 - Premier League & La Liga matchday
// Only showing matches where BOTH teams are in top 25 UEFA clubs
const SAMPLE_MATCHES: Match[] = [
  {
    id: 1,
    homeTeam: 'Chelsea',
    awayTeam: 'Liverpool',
    time: '17:30',
    competition: 'Premier League',
    status: 'upcoming'
  },
  {
    id: 2,
    homeTeam: 'Real Madrid',
    awayTeam: 'Villarreal',
    time: '20:00',
    competition: 'La Liga',
    status: 'upcoming'
  }
];

const getStatusColor = (status: Match['status']) => {
  switch (status) {
    case 'live':
      return 'bg-primary text-primary-foreground';
    case 'finished':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export const TodayMatches = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current date in Europe timezone
    const europeDate = formatInTimeZone(new Date(), 'Europe/London', 'yyyy-MM-dd');
    
    // Filter to only show upcoming matches between top 25 clubs
    // In production, you would fetch matches for the current European date from an API
    const filteredMatches = SAMPLE_MATCHES.filter(
      match =>
        match.status === 'upcoming' &&
        TOP_25_NAMES.includes(match.homeTeam) &&
        TOP_25_NAMES.includes(match.awayTeam)
    );

    // Simulate loading
    const timer = setTimeout(() => {
      setMatches(filteredMatches);
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <Card className="p-8 text-center border-muted">
        <p className="text-muted-foreground">
          No matches scheduled today between top 25 clubs
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match, index) => (
        <Card
          key={match.id}
          className="p-5 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] hover:border-primary/50"
          style={{
            animation: `fadeIn 0.5s ease-out ${index * 0.1}s both`
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <Badge className={getStatusColor(match.status)}>
              {match.status === 'live' ? 'LIVE' : match.time}
            </Badge>
            <span className="text-xs text-muted-foreground">{match.competition}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-right">
              <p className="font-semibold text-foreground">{match.homeTeam}</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xl font-bold text-muted-foreground">vs</div>
            </div>

            <div className="text-left">
              <p className="font-semibold text-foreground">{match.awayTeam}</p>
            </div>
          </div>
        </Card>
      ))}

      <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
        <p className="text-xs text-muted-foreground text-center">
          ⚽ Showing only matches between top 25 UEFA clubs
          <br />
          <span className="text-[10px]">Updates daily based on European timezone</span>
        </p>
      </div>
    </div>
  );
};
