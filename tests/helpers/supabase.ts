import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

if (!url || !publishableKey || !secretKey) {
  throw new Error("Missing Supabase env vars. Run `npm run db:start` and check .env.local.");
}

/** Secret key client: bypasses RLS. Used only to set up and tear down fixtures. */
export function adminClient(): SupabaseClient {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Publishable key client with no session, i.e. what an attacker starts with. */
export function anonClient(): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  nickname: string;
  /** Publishable key client signed in as this user: the real client surface. */
  client: SupabaseClient;
};

const PASSWORD = "senha-de-teste-123";

/**
 * Signs a user up through the public endpoint, so the profile is created by the
 * same trigger the app relies on. `metadata` lets a test try to inject a role.
 */
export async function createTestUser(options?: {
  nickname?: string;
  fullName?: string;
  metadata?: Record<string, unknown>;
}): Promise<TestUser> {
  const suffix = randomUUID().slice(0, 8);
  const email = `test-${suffix}@pelada.test`;
  const nickname = options?.nickname ?? `Teste ${suffix.slice(0, 4)}`;
  const fullName = options?.fullName ?? `Jogador Teste ${suffix.slice(0, 4)}`;

  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { full_name: fullName, nickname, ...(options?.metadata ?? {}) },
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("signUp returned no user");

  return { id: data.user.id, email, password: PASSWORD, nickname, client };
}

/** Approves a user the way an admin would, but without needing an admin fixture. */
export async function approve(userId: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: "approved" })
    .eq("id", userId);
  if (error) throw error;
}

/** The SQL bootstrap documented in SETUP.md, applied in a test. */
export async function makeAdmin(userId: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: "approved", role: "admin" })
    .eq("id", userId);
  if (error) throw error;
}

/** Deletes the auth users a test created; profiles cascade from there. */
export async function deleteUsers(userIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}

/** Reads a profile with the secret key, to assert what the database really stored. */
export async function readProfile(userId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, nickname, role, status")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Runs `fn` with `userId` as the only approved admin in the database, restoring
 * any other admins afterwards. Needed because the last-admin guard is global.
 */
export async function withSoleAdmin<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const admin = adminClient();
  const { data: others, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("status", "approved")
    .neq("id", userId);
  if (error) throw error;

  const otherIds = (others ?? []).map((row) => row.id as string);
  if (otherIds.length > 0) {
    await admin.from("profiles").update({ role: "player" }).in("id", otherIds);
  }

  try {
    return await fn();
  } finally {
    if (otherIds.length > 0) {
      await admin.from("profiles").update({ role: "admin" }).in("id", otherIds);
    }
  }
}
