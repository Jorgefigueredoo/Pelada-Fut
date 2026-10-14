"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteGameAction } from "@/lib/actions/games";

/** Irreversible, unlike canceling, so it needs its own explicit "are you sure". */
export function DeleteGameButton({ gameId }: { gameId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      // On success the action redirects to the list of peladas, so only a failure
      // comes back here.
      const result = await deleteGameAction(gameId);
      if (result?.error) toast.error(result.error);
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        className="text-destructive h-12 w-full"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        Excluir pelada
      </Button>
    );
  }

  return (
    <div className="border-destructive/30 animate-pop space-y-2 rounded-2xl border p-3">
      <p className="text-muted-foreground text-sm">
        Excluir apaga a pelada, a lista e todo o histórico, e não tem como desfazer.
        Quem estava na lista é avisado. Se só quer pausar, use Cancelar pelada.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="h-12 flex-1"
          disabled={pending}
          onClick={run}
        >
          {pending ? "Excluindo..." : "Sim, excluir"}
        </Button>
        <Button
          variant="ghost"
          className="h-12 flex-1"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Não
        </Button>
      </div>
    </div>
  );
}
