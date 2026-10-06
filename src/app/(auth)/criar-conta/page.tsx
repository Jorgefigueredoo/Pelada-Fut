import Link from "next/link";
import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <Card>
      <CardContent className="space-y-4">
        <SignUpForm />

        <p className="text-muted-foreground text-center text-sm">
          Depois de criar a conta, um admin precisa aprovar você para liberar a lista.
        </p>
        <p className="text-muted-foreground text-center text-sm">
          Já tem conta?{" "}
          <Link href="/entrar" className="text-foreground font-medium underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
