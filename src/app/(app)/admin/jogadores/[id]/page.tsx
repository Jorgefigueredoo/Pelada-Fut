import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EditPlayerForm } from "@/components/admin/edit-player-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminPlayer } from "@/lib/types";

export const metadata: Metadata = { title: "Editar jogador" };

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminProfile();
  const { id } = await params;

  const supabase = await createClient();
  // RLS already lets an admin read every profile and every row of
  // player_admin_data, so this is a plain read, no RPC needed.
  const [{ data: profile }, { data: adminData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("player_admin_data").select("email, stars").eq("user_id", id).maybeSingle(),
  ]);

  if (!profile) notFound();

  const player: AdminPlayer = {
    ...profile,
    email: adminData?.email ?? null,
    stars: adminData?.stars ?? null,
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/jogadores" className="text-muted-foreground text-sm underline">
        Voltar para jogadores
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Editar {player.nickname}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditPlayerForm player={player} />
        </CardContent>
      </Card>
    </div>
  );
}
