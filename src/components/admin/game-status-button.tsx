"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setGameStatusAction } from "@/lib/actions/games";
import type { GameStatus } from "@/lib/types";

export function GameStatusButton({
  gameId,
  status,
}: {
  gameId: string;
  status: GameStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const canceled = status === "canceled";

  function apply(next: GameStatus) {
    startTransition(async () => {
      const result = await setGameStatusAction(gameId, next);
      if (result.error) toast.error(result.error);
      else {
        toast.success(next === "canceled" ? "Pelada cancelada." : "Pelada reaberta.");
        setConfirming(false);
      }
    });
  }

  if (canceled) {
    return (
      <Button
        variant="outline"
        className="h-12 w-full"
        disabled={pending}
        onClick={() => apply("scheduled")}
      >
        Reabrir pelada
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button
        variant="outline"
        className="text-destructive h-12 w-full"
        onClick={() => setConfirming(true)}
      >
        Cancelar pelada
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        A lista é preservada e você pode reabrir depois. Ninguém confirma nem desiste
        enquanto estiver cancelada.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="h-12 flex-1"
          disabled={pending}
          onClick={() => apply("canceled")}
        >
          Sim, cancelar
        </Button>
        <Button
          variant="ghost"
          className="h-12 flex-1"
          onClick={() => setConfirming(false)}
        >
          Não
        </Button>
      </div>
    </div>
  );
}
