import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { requireApprovedProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Times" };

export default async function TeamsPage() {
  await requireApprovedProfile();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Times</h1>

      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">Times ainda não publicados</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Quando o admin sortear e publicar, os times aparecem aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
