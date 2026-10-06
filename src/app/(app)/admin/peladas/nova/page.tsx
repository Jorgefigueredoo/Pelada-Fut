import type { Metadata } from "next";

import { GameForm } from "@/components/admin/game-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminProfile } from "@/lib/auth";
import { nextOccurrence, previousOccurrence, toDateTimeLocalValue } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Nova pelada" };

export default async function NewGamePage() {
  await requireAdminProfile();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_app_settings");
  const settings = data as AppSettings | null;

  // The form opens with the group's defaults already filled in.
  const now = new Date().toISOString();
  const startsAt = nextOccurrence(
    now,
    settings?.game_weekday ?? 3,
    (settings?.game_time ?? "20:00").slice(0, 5),
  );
  const listOpensAt = previousOccurrence(
    startsAt,
    settings?.open_weekday ?? 1,
    (settings?.open_time ?? "20:00").slice(0, 5),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova pelada</CardTitle>
      </CardHeader>
      <CardContent>
        <GameForm
          defaults={{
            startsAt: toDateTimeLocalValue(startsAt),
            listOpensAt: toDateTimeLocalValue(listOpensAt),
            location: settings?.default_location ?? "",
            slots: settings?.default_slots ?? 20,
          }}
        />
      </CardContent>
    </Card>
  );
}
