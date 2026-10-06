"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminProfile } from "@/lib/auth";
import { fromDateTimeLocalValue } from "@/lib/datetime";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { GameStatus } from "@/lib/types";
import { firstError, gameSchema } from "@/lib/validation";

export type GameFormState = { error?: string; success?: string };

function readGameForm(formData: FormData) {
  return gameSchema.safeParse({
    startsAt: formData.get("startsAt"),
    listOpensAt: formData.get("listOpensAt"),
    location: formData.get("location") ?? "",
    slots: formData.get("slots"),
  });
}

export async function createGameAction(
  _previous: GameFormState,
  formData: FormData,
): Promise<GameFormState> {
  await requireAdminProfile();

  const parsed = readGameForm(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_game", {
    p_starts_at: fromDateTimeLocalValue(parsed.data.startsAt),
    p_location: parsed.data.location,
    p_slots: parsed.data.slots,
    p_list_opens_at: fromDateTimeLocalValue(parsed.data.listOpensAt),
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/admin/peladas");
  revalidatePath("/");
  redirect("/admin/peladas");
}

export async function updateGameAction(
  _previous: GameFormState,
  formData: FormData,
): Promise<GameFormState> {
  await requireAdminProfile();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { error: "Pelada não encontrada." };

  const parsed = readGameForm(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_game", {
    p_game_id: gameId,
    p_starts_at: fromDateTimeLocalValue(parsed.data.startsAt),
    p_location: parsed.data.location,
    p_slots: parsed.data.slots,
    p_list_opens_at: fromDateTimeLocalValue(parsed.data.listOpensAt),
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/admin/peladas");
  revalidatePath(`/admin/peladas/${gameId}`);
  revalidatePath("/");
  return { success: "Pelada salva." };
}

export async function setGameStatusAction(
  gameId: string,
  status: GameStatus,
): Promise<GameFormState> {
  await requireAdminProfile();

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_game_status", {
    p_game_id: gameId,
    p_status: status,
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/admin/peladas");
  revalidatePath(`/admin/peladas/${gameId}`);
  revalidatePath("/");
  return {};
}
