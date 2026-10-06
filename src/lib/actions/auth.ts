"use server";

import { redirect } from "next/navigation";

import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { firstError, signInSchema, signUpSchema } from "@/lib/validation";

export type FormState = { error?: string };

export async function signInAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyError(error) };

  redirect("/");
}

export async function signUpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  // The trigger ignores anything sent here other than the two names: a new account
  // is always created as player/pending.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, nickname: parsed.data.nickname },
    },
  });
  if (error) return { error: friendlyError(error) };

  // Email confirmation is off, so a session comes back right away.
  if (!data.session) redirect("/entrar?cadastro=ok");
  redirect("/aguardando");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
