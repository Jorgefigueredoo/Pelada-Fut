"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { DeletePlayerButton } from "@/components/admin/delete-player-button";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { setUserRoleAction, setUserStatusAction } from "@/lib/actions/admin-players";
import type { AdminPlayer, UserRole, UserStatus } from "@/lib/types";

export function PlayerActions({
  player,
  isSelf,
}: {
  player: AdminPlayer;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run(label: string, fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result?.error) toast.error(result.error);
      else toast.success(label);
    });
  }

  const setStatus = (status: UserStatus, label: string) =>
    run(label, () => setUserStatusAction(player.id, status));
  const setRole = (role: UserRole, label: string) =>
    run(label, () => setUserRoleAction(player.id, role));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {player.status === "pending" && (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => setStatus("approved", `${player.nickname} aprovado.`)}
            >
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setStatus("rejected", `${player.nickname} recusado.`)}
            >
              Recusar
            </Button>
          </>
        )}

        {player.status === "rejected" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setStatus("approved", `${player.nickname} aprovado.`)}
          >
            Aprovar
          </Button>
        )}

        {player.status === "blocked" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setStatus("approved", `${player.nickname} reativado.`)}
          >
            Reativar
          </Button>
        )}

        {player.status === "approved" && !isSelf && (
          <>
            {player.role === "player" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setRole("admin", `${player.nickname} agora é admin.`)}
              >
                Tornar admin
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setRole("player", `${player.nickname} não é mais admin.`)}
              >
                Remover admin
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => setStatus("blocked", `${player.nickname} inativado.`)}
            >
              Inativar
            </Button>
          </>
        )}
      </div>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/jogadores/${player.id}`}>Editar</Link>
        </Button>
        {!isSelf && <DeletePlayerButton userId={player.id} nickname={player.nickname} />}
      </div>
    </div>
  );
}
