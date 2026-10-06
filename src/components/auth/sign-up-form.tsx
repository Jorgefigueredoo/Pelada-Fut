"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="space-y-2">
        <Label htmlFor="fullName">Nome</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          className="h-12 text-base"
          placeholder="Como está no seu documento"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nickname">Apelido</Label>
        <Input
          id="nickname"
          name="nickname"
          required
          maxLength={24}
          className="h-12 text-base"
          placeholder="É o que aparece na lista"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          className="h-12 text-base"
          placeholder="voce@exemplo.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
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

      <SubmitButton pendingLabel="Criando conta...">Criar conta</SubmitButton>
    </form>
  );
}
