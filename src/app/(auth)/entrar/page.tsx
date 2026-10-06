import Link from "next/link";
import type { Metadata } from "next";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ cadastro?: string }>;
}) {
  const { cadastro } = await searchParams;

  return (
    <Card>
      <CardContent className="space-y-4">
        {cadastro === "ok" && (
          <Alert>
            <AlertDescription>
              Conta criada. Entre para acompanhar a aprovação.
            </AlertDescription>
          </Alert>
        )}

        <SignInForm />

        <p className="text-muted-foreground text-center text-sm">
          Não tem conta?{" "}
          <Link href="/criar-conta" className="text-foreground font-medium underline">
            Criar conta
          </Link>
        </p>
        <p className="text-muted-foreground text-center text-xs">
          Esqueceu a senha? Peça um link de redefinição para um admin no grupo.
        </p>
      </CardContent>
    </Card>
  );
}
