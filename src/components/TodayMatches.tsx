import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Match {
  id: number;
  homeTeam: string;
  awayTeam: string;
  time: string;
  competition: string;
  status: 'upcoming' | 'live' | 'finished';
  score?: { home: number; away: number };
}

// Fetch data from JSON files (updated daily by GitHub Actions)

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
    const fetchMatches = async () => {
      try {
        const basePath = import.meta.env.MODE === 'production' 
          ? '/top-soccer-matches' 
          : '';
        
        const response = await fetch(`${basePath}/data/todays-matches.json`);
        const data = await response.json();
        
        // Filter to only show upcoming matches
        const filteredMatches = data.filter((match: Match) => match.status === 'upcoming');
        
        setMatches(filteredMatches);
      } catch (error) {
        console.error('Error fetching matches:', error);
        setMatches([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
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
