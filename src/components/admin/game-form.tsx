"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createGameAction,
  updateGameAction,
  type GameFormState,
} from "@/lib/actions/games";
import { TIME_ZONE } from "@/lib/constants";

const initialState: GameFormState = {};

export type GameFormDefaults = {
  startsAt: string;
  listOpensAt: string;
  location: string;
  slots: number;
};

export function GameForm({
  defaults,
  gameId,
}: {
  defaults: GameFormDefaults;
  gameId?: string;
}) {
  const [state, formAction] = useActionState(
    gameId ? updateGameAction : createGameAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      {state.success && (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}
      {gameId && <input type="hidden" name="gameId" value={gameId} />}

      <div className="space-y-2">
        <Label htmlFor="startsAt">Dia e hora do jogo</Label>
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          defaultValue={defaults.startsAt}
          required
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="listOpensAt">Abertura da lista</Label>
        <Input
          id="listOpensAt"
          name="listOpensAt"
          type="datetime-local"
          defaultValue={defaults.listOpensAt}
          required
          className="h-12 text-base"
        />
        <p className="text-muted-foreground text-sm">
          Horários no fuso de Brasília ({TIME_ZONE}).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Local</Label>
        <Input
          id="location"
          name="location"
          defaultValue={defaults.location}
          maxLength={120}
          className="h-12 text-base"
          placeholder="Onde é a pelada"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slots">Vagas</Label>
        <Input
          id="slots"
          name="slots"
          type="number"
          inputMode="numeric"
          min={2}
          max={100}
          defaultValue={defaults.slots}
          required
          className="h-12 text-base"
        />
        {gameId && (
          <p className="text-muted-foreground text-sm">
            Mudar as vagas reajusta a lista pela ordem de chegada.
          </p>
        )}
      </div>

      <SubmitButton pendingLabel="Salvando...">
        {gameId ? "Salvar" : "Criar pelada"}
      </SubmitButton>
    </form>
  );
}
