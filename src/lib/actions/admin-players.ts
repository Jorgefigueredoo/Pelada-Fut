"use server";

import { revalidatePath } from "next/cache";

import { requireAdminProfile } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, UserStatus } from "@/lib/types";
import {
  adminCreatePlayerSchema,
  adminUpdatePlayerSchema,
  firstError,
} from "@/lib/validation";

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

export type CreatePlayerState = {
  error?: string;
  created?: boolean;
  /** Shown once, right after creation, when no password was typed in. */
  generatedPassword?: string;
};

function randomPassword(): string {
  // crypto.randomUUID() is available in the Node runtime Server Actions run on.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/**
 * Admin-created accounts skip the pending queue: the admin creating the account by
 * hand is the approval. There is no SMTP, so the password is either chosen by the
 * admin or generated here and shown once, to be sent over WhatsApp like everything
 * else credential-related in this app.
 */
export async function createPlayerAction(
  _previous: CreatePlayerState,
  formData: FormData,
): Promise<CreatePlayerState> {
  await requireAdminProfile();

  const parsed = adminCreatePlayerSchema.safeParse({
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname"),
    email: formData.get("email"),
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const password = parsed.data.password || randomPassword();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName, nickname: parsed.data.nickname },
  });
  if (error || !data.user) return { error: friendlyError(error) };

  const supabase = await createClient();
  const { error: approveError } = await supabase.rpc("admin_set_user_status", {
    p_user_id: data.user.id,
    p_status: "approved",
  });
  if (approveError) return { error: friendlyError(approveError) };

  revalidatePath("/admin/jogadores");
  return {
    created: true,
    generatedPassword: parsed.data.password ? undefined : password,
  };
}

export type UpdatePlayerState = { error?: string; success?: string };

/** Edits another player's name, nickname and email. Self-service editing is separate. */
export async function updatePlayerAction(
  userId: string,
  _previous: UpdatePlayerState,
  formData: FormData,
): Promise<UpdatePlayerState> {
  await requireAdminProfile();

  const parsed = adminUpdatePlayerSchema.safeParse({
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error: profileError } = await supabase.rpc("admin_update_player", {
    p_user_id: userId,
    p_full_name: parsed.data.fullName,
    p_nickname: parsed.data.nickname,
  });
  if (profileError) return { error: friendlyError(profileError) };

  const admin = createAdminClient();
  const { error: emailError } = await admin.auth.admin.updateUserById(userId, {
    email: parsed.data.email,
  });
  if (emailError) return { error: friendlyError(emailError) };

  revalidatePath("/admin/jogadores");
  revalidatePath(`/admin/jogadores/${userId}`);
  return { success: "Jogador atualizado." };
}

/**
 * Deletes the account entirely. First takes the player off every list they are
 * still active on (promoting the waitlist exactly like a normal drop-out), then
 * removes the auth user through the Admin API, which owns session/token cleanup
 * that a plain SQL delete would not do. profiles and player_admin_data cascade
 * from there; signup_events keeps the history with the actor set to null.
 */
export async function deletePlayerAction(userId: string): Promise<AdminActionState> {
  const profile = await requireAdminProfile();

  if (userId === profile.id) {
    return { error: "Você não pode excluir sua própria conta." };
  }

  const supabase = await createClient();
  const { error: prepareError } = await supabase.rpc("admin_prepare_player_deletion", {
    p_user_id: userId,
  });
  if (prepareError) return { error: friendlyError(prepareError) };

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return { error: friendlyError(deleteError) };

  revalidatePath("/admin/jogadores");
  return { success: "Jogador excluído." };
}
