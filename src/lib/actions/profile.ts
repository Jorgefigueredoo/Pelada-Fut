"use server";

import { revalidatePath } from "next/cache";

import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, firstError, updateProfileSchema } from "@/lib/validation";

export type ProfileFormState = { error?: string; success?: string };

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: parsed.data.fullName,
    p_nickname: parsed.data.nickname,
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/perfil");
  revalidatePath("/");
  return { success: "Dados salvos." };
}

export async function changePasswordAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = changePasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: friendlyError(error) };

  return { success: "Senha trocada." };
}
