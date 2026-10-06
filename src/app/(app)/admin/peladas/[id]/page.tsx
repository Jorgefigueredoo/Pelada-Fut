import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { GameForm } from "@/components/admin/game-form";
import { GameStatusButton } from "@/components/admin/game-status-button";
import { SignupList } from "@/components/game/signup-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminProfile } from "@/lib/auth";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import type { GameState } from "@/lib/types";

export const metadata: Metadata = { title: "Pelada" };

export default async function AdminGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAdminProfile();
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_game_state", { p_game_id: id });
  const state = data as GameState | null;
  if (!state?.game) notFound();

  const game = state.game;

  return (
    <div className="space-y-6">
      <Link href="/admin/peladas" className="text-muted-foreground text-sm underline">
        Voltar para as peladas
      </Link>

      {game.status === "canceled" && <Badge variant="destructive">Cancelada</Badge>}

      <Card>
        <CardHeader>
          <CardTitle>Editar pelada</CardTitle>
        </CardHeader>
        <CardContent>
          <GameForm
            gameId={game.id}
            defaults={{
              startsAt: toDateTimeLocalValue(game.starts_at),
              listOpensAt: toDateTimeLocalValue(game.list_opens_at),
              location: game.location,
              slots: game.slots,
            }}
          />
        </CardContent>
      </Card>

      <SignupList
        entries={state.entries}
        currentUserId={profile.id}
        slots={game.slots}
      />

      <GameStatusButton gameId={game.id} status={game.status} />
    </div>
  );
}
