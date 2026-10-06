"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePlayerAction, type UpdatePlayerState } from "@/lib/actions/admin-players";
import type { AdminPlayer } from "@/lib/types";

const initialState: UpdatePlayerState = {};

export function EditPlayerForm({ player }: { player: AdminPlayer }) {
  const [state, formAction] = useActionState(
    (previous: UpdatePlayerState, formData: FormData) =>
      updatePlayerAction(player.id, previous, formData),
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

      <div className="space-y-2">
        <Label htmlFor="fullName">Nome</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={player.full_name}
          required
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nickname">Apelido</Label>
        <Input
          id="nickname"
          name="nickname"
          defaultValue={player.nickname}
          required
          maxLength={24}
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          defaultValue={player.email ?? ""}
          required
          className="h-12 text-base"
        />
      </div>

      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
    </form>
  );
}
