"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlayerAction, type CreatePlayerState } from "@/lib/actions/admin-players";

const initialState: CreatePlayerState = {};

export function CreatePlayerForm() {
  const [state, formAction] = useActionState(createPlayerAction, initialState);

  if (state.created) {
    return state.generatedPassword ? (
      <GeneratedPasswordHint password={state.generatedPassword} />
    ) : (
      <OwnPasswordHint />
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="space-y-2">
        <Label htmlFor="fullName">Nome</Label>
        <Input id="fullName" name="fullName" required className="h-12 text-base" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nickname">Apelido</Label>
        <Input
          id="nickname"
          name="nickname"
          required
          maxLength={24}
          className="h-12 text-base"
        />
        <p className="text-muted-foreground text-sm">É o que aparece na lista.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          required
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha (opcional)</Label>
        <Input id="password" name="password" type="password" className="h-12 text-base" />
        <p className="text-muted-foreground text-sm">
          Deixe em branco para gerar uma senha automática, que aparece na tela depois
          de criar — não tem como ver de novo, então copie e mande no WhatsApp.
        </p>
      </div>

      <SubmitButton pendingLabel="Criando...">Criar jogador</SubmitButton>
    </form>
  );
}

function OwnPasswordHint() {
  return (
    <Alert>
      <AlertTitle>Jogador criado</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>A conta já está aprovada e pronta para uso.</p>
        <Link href="/admin/jogadores" className="text-foreground block text-sm underline">
          Voltar para jogadores
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function GeneratedPasswordHint({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable; the password is still shown on screen.
    }
  }

  return (
    <Alert>
      <AlertTitle>Jogador criado</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Senha gerada automaticamente. Copie agora e mande no WhatsApp — ela não
          aparece de novo.
        </p>
        <div className="flex items-center gap-2">
          <code className="bg-muted flex-1 rounded px-2 py-1.5 text-sm">{password}</code>
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <Link href="/admin/jogadores" className="text-foreground block text-sm underline">
          Voltar para jogadores
        </Link>
      </AlertDescription>
    </Alert>
  );
}
