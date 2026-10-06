import Link from "next/link";
import type { Metadata } from "next";

import { CreatePlayerForm } from "@/components/admin/create-player-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Novo jogador" };

export default async function NewPlayerPage() {
  await requireAdminProfile();

  return (
    <div className="space-y-6">
      <Link href="/admin/jogadores" className="text-muted-foreground text-sm underline">
        Voltar para jogadores
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Novo jogador</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePlayerForm />
        </CardContent>
      </Card>
    </div>
  );
}
