"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, type ProfileFormState } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types";

const initialState: ProfileFormState = {};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(updateProfileAction, initialState);

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
          defaultValue={profile.full_name}
          required
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nickname">Apelido</Label>
        <Input
          id="nickname"
          name="nickname"
          defaultValue={profile.nickname}
          required
          maxLength={24}
          className="h-12 text-base"
        />
        <p className="text-muted-foreground text-sm">É o que aparece na lista.</p>
      </div>

      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
    </form>
  );
}
