import { GameCard } from "@/components/game/game-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { requireApprovedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UpcomingGames } from "@/lib/types";

export default async function HomePage() {
  const supabase = await createClient();
  // In parallel: the database checks approval inside get_upcoming_games anyway, and
  // an unapproved user is redirected before anything they could not see is shown.
  const [profile, { data, error }] = await Promise.all([
    requireApprovedProfile(),
    supabase.rpc("get_upcoming_games"),
  ]);
  const upcoming = data as UpcomingGames | null;
  const games = upcoming?.games ?? [];

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">Olá, {profile.nickname}</p>

      {error || !upcoming ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar as peladas. Recarregue a página.
          </AlertDescription>
        </Alert>
      ) : games.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Nenhuma pelada marcada</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Quando um admin marcar a próxima pelada, ela aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {games.map((game) => (
            <GameCard
              key={game.game!.id}
              initialState={game}
              currentUserId={profile.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
