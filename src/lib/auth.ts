import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * The signed-in user's profile, or null when there is no valid session.
 *
 * Memoized per request: layouts and pages render in parallel and each one checks the
 * profile, so without this every page load paid for two or three identical session
 * checks and profile reads. Outside a render (in a Server Action) it simply runs.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, nickname, role, status, avatar_path, avatar_updated_at")
    .eq("id", userId)
    .maybeSingle();

  return (profile as Profile | null) ?? null;
});

/** Server-side gate for every player page. */
export async function requireApprovedProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/entrar");
  if (profile.status !== "approved") redirect("/aguardando");
  return profile;
}

/** Server-side gate for every admin page and route handler. */
export async function requireAdminProfile(): Promise<Profile> {
  const profile = await requireApprovedProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
