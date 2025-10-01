import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Club {
  rank: number;
  name: string;
  country: string;
  points: string;
}

// UEFA 5-year Club Rankings (Updated from kassiesa.net)
// Source: https://kassiesa.net/uefa/data/method5/trank2025.html
const TOP_25_CLUBS: Club[] = [
  { rank: 1, name: 'Real Madrid', country: 'Spain', points: '143.500' },
  { rank: 2, name: 'Manchester City', country: 'England', points: '137.750' },
  { rank: 3, name: 'Bayern München', country: 'Germany', points: '135.250' },
  { rank: 4, name: 'Liverpool', country: 'England', points: '125.500' },
  { rank: 5, name: 'Paris Saint-Germain', country: 'France', points: '118.500' },
  { rank: 6, name: 'Internazionale', country: 'Italy', points: '116.250' },
  { rank: 7, name: 'Chelsea', country: 'England', points: '109.000' },
  { rank: 8, name: 'Borussia Dortmund', country: 'Germany', points: '106.750' },
  { rank: 9, name: 'AS Roma', country: 'Italy', points: '104.500' },
  { rank: 10, name: 'FC Barcelona', country: 'Spain', points: '103.250' },
  { rank: 11, name: 'Manchester United', country: 'England', points: '102.500' },
  { rank: 12, name: 'Arsenal', country: 'England', points: '98.000' },
  { rank: 13, name: 'Bayer Leverkusen', country: 'Germany', points: '95.250' },
  { rank: 14, name: 'Atlético Madrid', country: 'Spain', points: '93.500' },
  { rank: 15, name: 'Benfica', country: 'Portugal', points: '87.750' },
  { rank: 16, name: 'Atalanta', country: 'Italy', points: '82.000' },
  { rank: 17, name: 'Villarreal', country: 'Spain', points: '82.000' },
  { rank: 18, name: 'FC Porto', country: 'Portugal', points: '79.750' },
  { rank: 19, name: 'AC Milan', country: 'Italy', points: '78.000' },
  { rank: 20, name: 'RB Leipzig', country: 'Germany', points: '78.000' },
  { rank: 21, name: 'Lazio', country: 'Italy', points: '76.000' },
  { rank: 22, name: 'Juventus', country: 'Italy', points: '74.250' },
  { rank: 23, name: 'Eintracht Frankfurt', country: 'Germany', points: '74.000' },
  { rank: 24, name: 'Club Brugge', country: 'Belgium', points: '71.750' },
  { rank: 25, name: 'Glasgow Rangers', country: 'Scotland', points: '71.250' },
];

export const ClubList = () => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading for smooth animation
    const timer = setTimeout(() => {
      setClubs(TOP_25_CLUBS);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(25)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clubs.map((club, index) => (
        <Card
          key={club.rank}
          className="p-4 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] hover:border-primary/50"
          style={{
            animation: `fadeIn 0.5s ease-out ${index * 0.03}s both`
          }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary font-bold text-lg">
              {club.rank}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground">{club.name}</h3>
              <p className="text-sm text-muted-foreground">{club.country}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-primary">{club.points}</p>
              <p className="text-xs text-muted-foreground">points</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
