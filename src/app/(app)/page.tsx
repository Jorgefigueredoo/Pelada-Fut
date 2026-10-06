import { GameCard } from "@/components/game/game-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireApprovedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GameState } from "@/lib/types";

export default async function HomePage() {
  const profile = await requireApprovedProfile();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_next_game");

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">Olá, {profile.nickname}</p>

      {error || !data ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar a próxima pelada. Recarregue a página.
          </AlertDescription>
        </Alert>
      ) : (
        <GameCard initialState={data as GameState} currentUserId={profile.id} />
      )}
    </div>
  );
}
