import type { Metadata } from "next";

import { Shuffle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { requireApprovedProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Times" };

export default async function TeamsPage() {
  await requireApprovedProfile();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Times</h1>

      <EmptyState
        icon={Shuffle}
        title="Times ainda não publicados"
        description="Quando o admin sortear e publicar, os times aparecem aqui. Fique de olho no sino."
      />
    </div>
  );
}
