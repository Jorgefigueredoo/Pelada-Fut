import type { Metadata } from "next";

import { PlayerCard } from "@/components/admin/player-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireAdminProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminPlayer } from "@/lib/types";

export const metadata: Metadata = { title: "Jogadores" };

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireAdminProfile();
  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  const supabase = await createClient();
  const [pendingResult, allResult] = await Promise.all([
    supabase.rpc("admin_list_players", { p_status: "pending" }),
    supabase.rpc("admin_list_players", { p_search: search || null }),
  ]);

  const pendingPlayers = (pendingResult.data ?? []) as AdminPlayer[];
  const allPlayers = (allResult.data ?? []) as AdminPlayer[];
  const loadError = pendingResult.error ?? allResult.error;

  return (
    <div className="space-y-8">
      {loadError && (
        <Card>
          <CardContent className="text-destructive text-sm">
            Não foi possível carregar os jogadores. Recarregue a página.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">
          Pendentes{pendingPlayers.length > 0 && ` (${pendingPlayers.length})`}
        </h2>
        {pendingPlayers.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground text-sm">
              Nenhum cadastro esperando aprovação.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} currentUserId={profile.id} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Todos os jogadores ({allPlayers.length})</h2>

        <form className="flex gap-2">
          <Input
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, apelido ou e-mail"
            className="h-12 text-base"
          />
          <Button type="submit" variant="outline" className="h-12">
            Buscar
          </Button>
        </form>

        {allPlayers.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground text-sm">
              Nenhum jogador encontrado.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {allPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} currentUserId={profile.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
