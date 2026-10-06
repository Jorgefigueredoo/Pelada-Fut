import Link from "next/link";
import type { Metadata } from "next";
import { UserPlus } from "lucide-react";

import { Pagination } from "@/components/admin/pagination";
import { PlayerCard } from "@/components/admin/player-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireAdminProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PLAYERS_PER_PAGE, type AdminPlayer, type AdminPlayerPage } from "@/lib/types";

export const metadata: Metadata = { title: "Jogadores" };

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const profile = await requireAdminProfile();
  const { q, page: pageParam } = await searchParams;
  const search = q?.trim() ?? "";
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const [pendingResult, allResult] = await Promise.all([
    supabase.rpc("admin_list_players", {
      p_status: "pending",
      p_per_page: 100,
    }),
    supabase.rpc("admin_list_players", {
      p_search: search || null,
      p_page: page,
      p_per_page: PLAYERS_PER_PAGE,
    }),
  ]);

  const pendingPlayers = (pendingResult.data as AdminPlayerPage | null)?.items ?? [];
  const allPage = allResult.data as AdminPlayerPage | null;
  const allPlayers: AdminPlayer[] = allPage?.items ?? [];
  const total = allPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PLAYERS_PER_PAGE));
  const loadError = pendingResult.error ?? allResult.error;

  return (
    <div className="space-y-8">
      <Button asChild className="h-12 w-full">
        <Link href="/admin/jogadores/novo">
          <UserPlus className="size-4" aria-hidden />
          Novo jogador
        </Link>
      </Button>

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
        <h2 className="font-semibold">Todos os jogadores ({total})</h2>

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
          <>
            <div className="space-y-3">
              {allPlayers.map((player) => (
                <PlayerCard key={player.id} player={player} currentUserId={profile.id} />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/admin/jogadores"
              searchParams={{ q: search || undefined }}
            />
          </>
        )}
      </section>
    </div>
  );
}
