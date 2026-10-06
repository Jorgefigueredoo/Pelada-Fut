"use server";

import { revalidatePath } from "next/cache";

import { requireAdminProfile } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, UserStatus } from "@/lib/types";

export type AdminActionState = { error?: string; success?: string };

/**
 * The role check runs here on the server and again inside the database function,
 * so hiding the button is never what keeps a player out.
 */
export async function setUserStatusAction(
  userId: string,
  status: UserStatus,
): Promise<AdminActionState> {
  await requireAdminProfile();

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: userId,
    p_status: status,
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/admin/jogadores");
  return { success: "Pronto." };
}

export async function setUserRoleAction(
  userId: string,
  role: UserRole,
): Promise<AdminActionState> {
  await requireAdminProfile();

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/admin/jogadores");
  return { success: "Pronto." };
}
