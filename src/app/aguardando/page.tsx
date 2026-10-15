import { redirect } from "next/navigation";
import { Clock, Goal } from "lucide-react";
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
        <header className="animate-in fade-in-0 slide-in-from-top-2 space-y-3 text-center duration-500">
          <div className="bg-pitch-stripes text-gold mx-auto grid size-16 place-items-center rounded-3xl shadow-lg shadow-primary/30">
            <Goal className="size-8" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {pending && <Clock className="text-gold size-5 animate-pulse" aria-hidden />}
              {pending ? "Aguardando aprovação" : "Sem acesso"}
            </CardTitle>
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
