"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deletePlayerAction } from "@/lib/actions/admin-players";

/** Irreversible, so it needs its own explicit "are you sure", not just a click. */
export function DeletePlayerButton({
  userId,
  nickname,
}: {
  userId: string;
  nickname: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      const result = await deletePlayerAction(userId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${nickname} excluído.`);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => setConfirming(true)}
      >
        Excluir
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-destructive/30 p-2">
      <p className="text-muted-foreground flex-1 text-xs">
        Excluir {nickname} apaga a conta e tira a pessoa de qualquer lista ativa. Não
        tem como desfazer.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={pending} onClick={run}>
          {pending ? "Excluindo..." : "Sim, excluir"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Não
        </Button>
      </div>
    </div>
  );
}
