import { CalendarPlus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { GameCard } from "@/components/game/game-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { requireApprovedProfile } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { formatGameDate } from "@/lib/datetime";
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
  const today = formatGameDate(upcoming?.server_time ?? new Date().toISOString());

  return (
    <div className="space-y-6">
      <header className="animate-in fade-in-0 slide-in-from-top-2 flex items-center gap-3 duration-500">
        <Avatar className="ring-primary/30 ring-offset-background size-12 shrink-0 ring-2 ring-offset-2">
          <AvatarImage
            src={avatarUrl(profile.avatar_path, profile.avatar_updated_at) ?? undefined}
            alt=""
          />
          <AvatarFallback className="bg-pitch-stripes text-gold font-semibold">
            {profile.nickname.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold tracking-tight">Olá, {profile.nickname}</p>
          <p className="text-muted-foreground text-sm">{today}</p>
        </div>
      </header>

      {error || !upcoming ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar as peladas. Recarregue a página.
          </AlertDescription>
        </Alert>
      ) : games.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Nenhuma pelada marcada"
          description="Quando um admin marcar a próxima pelada, ela aparece aqui com a contagem para a lista abrir."
        />
      ) : (
        <div className="space-y-10">
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
