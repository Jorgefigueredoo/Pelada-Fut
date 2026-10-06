import { GameCard } from "@/components/game/game-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireApprovedProfile } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { GameState } from "@/lib/types";

export default async function HomePage() {
  const profile = await requireApprovedProfile();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_next_game");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-muted-foreground text-sm">Olá, {profile.nickname}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      </header>

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
