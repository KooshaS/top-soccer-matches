import { TodayMatches } from '@/components/TodayMatches';
import { formatInTimeZone } from 'date-fns-tz';

const Index = () => {
  // Use Europe/London timezone for consistent European time
  const currentDate = formatInTimeZone(
    new Date(),
    'Europe/London',
    'EEEE, MMMM d, yyyy'
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <header className="text-center mb-12 space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground tracking-tight">
            Today's Top Matches
            <span className="block text-primary mt-2">European Football</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            {currentDate}
          </p>
          <div className="w-20 h-1 bg-primary mx-auto rounded-full" />
        </header>

        <main>
          <TodayMatches />
        </main>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default Index;
