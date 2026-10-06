"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type ProfileFormState } from "@/lib/actions/profile";

const initialState: ProfileFormState = {};

export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      {state.success && (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="h-12 text-base"
        />
        <p className="text-muted-foreground text-sm">Pelo menos 8 caracteres.</p>
      </div>

      <SubmitButton variant="outline" pendingLabel="Trocando...">
        Trocar senha
      </SubmitButton>
    </form>
  );
}
