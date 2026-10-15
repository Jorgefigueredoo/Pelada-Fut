import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus, ChevronRight, MapPin, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminProfile } from "@/lib/auth";
import { dateBadge, formatShort, formatTime } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import type { AdminGame } from "@/lib/types";
import { cn } from "@/lib/utils";

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
        <EmptyState
          icon={CalendarPlus}
          title="Nenhuma pelada criada ainda."
          description="Toque em Nova pelada para marcar a primeira. A data, o horário e as vagas já vêm preenchidos."
        />
      ) : (
        <div className="space-y-3">
          {games.map((game, index) => {
            const badge = dateBadge(game.starts_at);
            const canceled = game.status === "canceled";
            const fill = Math.min(100, Math.round((game.confirmed_count / game.slots) * 100));
            return (
              <Card
                key={game.id}
                className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards py-0 duration-300 transition-shadow hover:shadow-md"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <Link href={`/admin/peladas/${game.id}`} className="flex items-stretch gap-3 p-3">
                  <div
                    className={cn(
                      "flex w-16 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-white",
                      canceled ? "bg-muted-foreground/60" : "bg-pitch-stripes",
                    )}
                  >
                    <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                      {badge.weekday}
                    </span>
                    <span className="text-2xl leading-none font-semibold tabular-nums">
                      {badge.day}
                    </span>
                    <span className="text-gold text-[11px] font-semibold uppercase">
                      {badge.month}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{formatTime(game.starts_at)}</p>
                      {canceled && (
                        <Badge variant="destructive" className="shrink-0">
                          Cancelada
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1 truncate text-sm">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {game.location || "Local a definir"}
                    </p>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn("h-full rounded-full", fill >= 100 ? "bg-gold" : "bg-primary")}
                        style={{ width: `${fill}%` }}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {game.confirmed_count}/{game.slots} confirmados
                      {game.waitlist_count > 0 && ` · ${game.waitlist_count} na espera`}
                      {" · "}Lista abre {formatShort(game.list_opens_at)}
                    </p>
                  </div>

                  <ChevronRight className="text-muted-foreground size-5 shrink-0 self-center" aria-hidden />
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
