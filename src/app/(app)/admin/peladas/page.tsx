import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminProfile } from "@/lib/auth";
import { formatGameDateTime, formatShort } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import type { AdminGame } from "@/lib/types";

export const metadata: Metadata = { title: "Peladas" };

export default async function AdminGamesPage() {
  await requireAdminProfile();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_games");
  const games = (data ?? []) as AdminGame[];

  return (
    <div className="space-y-4">
      <Button asChild className="h-12 w-full">
        <Link href="/admin/peladas/nova">
          <Plus className="size-4" aria-hidden />
          Nova pelada
        </Link>
      </Button>

      {error && (
        <Card>
          <CardContent className="text-destructive text-sm">
            Não foi possível carregar as peladas. Recarregue a página.
          </CardContent>
        </Card>
      )}

      {games.length === 0 && !error ? (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            Nenhuma pelada criada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <Card key={game.id}>
              <CardContent>
                <Link href={`/admin/peladas/${game.id}`} className="block space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{formatGameDateTime(game.starts_at)}</p>
                    {game.status === "canceled" && (
                      <Badge variant="destructive" className="shrink-0">
                        Cancelada
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {game.location || "Local a definir"}
                  </p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {game.confirmed_count}/{game.slots} confirmados
                    {game.waitlist_count > 0 && ` · ${game.waitlist_count} na espera`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Lista abre {formatShort(game.list_opens_at)}
                  </p>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
