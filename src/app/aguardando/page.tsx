import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/actions/auth";
import { getCurrentProfile } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Aguardando aprovação" };

// Authenticated output is never prerendered or cached, at any layer.
export const dynamic = "force-dynamic";

export default async function WaitingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/entrar");
  if (profile.status === "approved") redirect("/");

  const pending = profile.status === "pending";

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{pending ? "Aguardando aprovação" : "Sem acesso"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pending ? (
              <p className="text-muted-foreground text-sm">
                Olá, {profile.full_name.split(" ")[0]}. Sua conta foi criada e está na
                fila de aprovação. Avise um admin no grupo do WhatsApp para liberar seu
                acesso à lista.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Sua conta não tem acesso ao app. Fale com um admin do grupo.
              </p>
            )}

            <form action={signOutAction}>
              <SubmitButton variant="outline" pendingLabel="Saindo...">
                Sair
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
