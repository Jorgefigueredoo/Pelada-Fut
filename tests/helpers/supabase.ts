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

export type GameOptions = {
  slots?: number;
  /** Milliseconds from now until the list opens. Negative means already open. */
  opensInMs?: number;
  /** Milliseconds from now until kickoff. */
  startsInMs?: number;
  location?: string;
};

/** Creates a pelada with the secret key, so a test does not need an admin fixture. */
export async function createGame(options: GameOptions = {}): Promise<string> {
  const now = Date.now();
  const admin = adminClient();

  const { data, error } = await admin
    .from("games")
    .insert({
      slots: options.slots ?? 20,
      location: options.location ?? "Quadra de teste",
      list_opens_at: new Date(now + (options.opensInMs ?? -1_000)).toISOString(),
      starts_at: new Date(now + (options.startsInMs ?? 2 * 60 * 60 * 1000)).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  return data.id as string;
}

export async function deleteGames(gameIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const id of gameIds) {
    await admin.from("games").delete().eq("id", id);
  }
}

/** Raw signups for a pelada, ordered by arrival, read past RLS for assertions. */
export async function readSignups(gameId: string) {
  const { data, error } = await adminClient()
    .from("signups")
    .select("user_id, seq, status, joined_at, added_by_admin, promoted_at, demoted_at")
    .eq("game_id", gameId)
    .order("seq");
  if (error) throw error;
  return data as Array<{
    user_id: string;
    seq: number;
    status: "confirmed" | "waitlist" | "out";
    joined_at: string;
    added_by_admin: boolean;
    promoted_at: string | null;
    demoted_at: string | null;
  }>;
}

export type GameState = {
  server_time: string;
  game: {
    id: string;
    starts_at: string;
    location: string;
    slots: number;
    list_opens_at: string;
    status: "scheduled" | "canceled";
    is_open: boolean;
  } | null;
  entries: Array<{
    seq: number;
    user_id: string;
    nickname: string;
    first_name: string;
    status: "confirmed" | "waitlist";
    joined_at: string;
    added_by_admin: boolean;
    position: number;
  }>;
  my_signup: {
    status: "confirmed" | "waitlist";
    position: number;
    joined_at: string;
    added_by_admin: boolean;
    promoted_at: string | null;
    demoted_at: string | null;
  } | null;
};

/** Sets the pelada's clock fields directly, to test "before opening" and "after kickoff". */
export async function setGameTimes(
  gameId: string,
  times: { opensInMs?: number; startsInMs?: number },
): Promise<void> {
  const now = Date.now();
  const patch: Record<string, string> = {};
  if (times.opensInMs !== undefined) {
    patch.list_opens_at = new Date(now + times.opensInMs).toISOString();
  }
  if (times.startsInMs !== undefined) {
    patch.starts_at = new Date(now + times.startsInMs).toISOString();
  }

  const { error } = await adminClient().from("games").update(patch).eq("id", gameId);
  if (error) throw error;
}
