import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Secret key client. Bypasses RLS, so it is only used where the route has already
 * checked the caller is an admin on the server. Never import this from a client component.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
