import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client, publishable key only. The Confirmar button calls the database
 * function straight from here: one hop less and no cold start at the opening second.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
