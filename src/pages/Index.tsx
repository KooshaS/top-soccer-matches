import { ClubList } from '@/components/ClubList';
import { TodayMatches } from '@/components/TodayMatches';
import { Separator } from '@/components/ui/separator';

const Index = () => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <header className="text-center mb-12 space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground tracking-tight">
            Top 25 European
            <span className="block text-primary mt-2">Football Clubs</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            {currentDate}
          </p>
          <div className="w-20 h-1 bg-primary mx-auto rounded-full" />
        </header>

        <main className="space-y-12">
          {/* Today's Matches Section */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <span className="text-primary">⚽</span>
              Today's Matches
            </h2>
            <TodayMatches />
          </section>

          <Separator className="my-8" />

          {/* Rankings Section */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <span className="text-primary">🏆</span>
              UEFA Rankings
            </h2>
            <ClubList />
          </section>
        </main>

        <footer className="text-center mt-12 text-sm text-muted-foreground">
          <p>
            UEFA 5-year rankings from{' '}
            <a
              href="https://kassiesa.net/uefa/data/method5/trank2025.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              kassiesa.net
            </a>
          </p>
        </footer>
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
