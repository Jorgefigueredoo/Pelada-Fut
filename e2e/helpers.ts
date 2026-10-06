import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

export const TEST_PASSWORD = "senha-de-teste-123";

function admin() {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Creates an approved admin directly, standing in for the SQL bootstrap. */
export async function createAdmin() {
  const email = `e2e-admin-${randomUUID().slice(0, 8)}@pelada.test`;
  const client = admin();

  const { data, error } = await client.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Admin E2E", nickname: "AdminE2E" },
  });
  if (error) throw error;

  await client
    .from("profiles")
    .update({ status: "approved", role: "admin" })
    .eq("id", data.user.id);

  return { id: data.user.id, email };
}

export async function deleteUsersByEmailPrefix(prefix: string) {
  const client = admin();
  const { data } = await client.auth.admin.listUsers({ perPage: 200 });
  for (const user of data?.users ?? []) {
    if (user.email?.startsWith(prefix)) {
      await client.auth.admin.deleteUser(user.id);
    }
  }
}

export function uniqueEmail(prefix: string) {
  return `${prefix}${randomUUID().slice(0, 8)}@pelada.test`;
}

/** Creates an approved player, ready to sign in. */
export async function createApprovedPlayer(prefix: string, nickname: string, fullName: string) {
  const email = uniqueEmail(prefix);
  const client = admin();

  const { data, error } = await client.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, nickname },
  });
  if (error) throw error;

  await client.from("profiles").update({ status: "approved" }).eq("id", data.user.id);

  return { id: data.user.id, email, nickname };
}

/** Removes only the peladas this suite created, found by their marker location. */
export async function deleteE2EGames(location: string) {
  const { error } = await admin().from("games").delete().eq("location", location);
  if (error) throw error;
}
