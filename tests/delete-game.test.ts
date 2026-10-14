import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  approve,
  createGame,
  createTestUser,
  deleteGames,
  deleteUsers,
  makeAdmin,
  setGameTimes,
  type TestUser,
} from "./helpers/supabase";

/** Deleting a pelada is irreversible, unlike canceling, so every edge is pinned here. */
describe("admin_delete_game", () => {
  const users: string[] = [];
  const games: string[] = [];
  let admin: TestUser;
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    admin = await createTestUser({ nickname: "Chefe" });
    a = await createTestUser({ nickname: "Um" });
    b = await createTestUser({ nickname: "Dois" });
    users.push(admin.id, a.id, b.id);
    await makeAdmin(admin.id);
    await approve(a.id);
    await approve(b.id);
  });

  afterAll(async () => {
    await deleteGames(games);
    await deleteUsers(users);
  });

  async function newGame(options: Parameters<typeof createGame>[0] = {}) {
    const id = await createGame(options);
    games.push(id);
    return id;
  }

  async function count(table: string, column: string, value: string) {
    const { count: rows, error } = await adminClient()
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, value);
    if (error) throw error;
    return rows ?? 0;
  }

  async function notificationsFor(userId: string) {
    const { data, error } = await adminClient()
      .from("notifications")
      .select("type, game_id, meta")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  }

  it("deletes the pelada with its list and its history", async () => {
    const gameId = await newGame({ slots: 2, location: "Quadra apagada" });
    await a.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });

    expect(await count("signups", "game_id", gameId)).toBe(2);
    expect(await count("signup_events", "game_id", gameId)).toBeGreaterThan(0);

    const { data, error } = await admin.client.rpc("admin_delete_game", { p_game_id: gameId });
    expect(error).toBeNull();
    expect(data).toEqual({ deleted: true, removed_signups: 2 });

    expect(await count("games", "id", gameId)).toBe(0);
    expect(await count("signups", "game_id", gameId)).toBe(0);
    expect(await count("signup_events", "game_id", gameId)).toBe(0);
  });

  it("tells everyone on the list, in a notification that outlives the pelada", async () => {
    const gameId = await newGame({ slots: 2, location: "Quadra do aviso" });
    await a.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });

    await admin.client.rpc("admin_delete_game", { p_game_id: gameId });

    for (const player of [a, b]) {
      const [notification] = (await notificationsFor(player.id)).filter(
        (n) => n.meta?.location === "Quadra do aviso",
      );
      expect(notification.meta.deleted).toBe(true);
      expect(notification.type).toBe("game_canceled");
      expect(notification.game_id).toBeNull();
      expect(notification.meta.location).toBe("Quadra do aviso");
      expect(new Date(notification.meta.starts_at as string).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("does not notify again when the pelada was already canceled", async () => {
    const gameId = await newGame();
    await a.client.rpc("join_game", { p_game_id: gameId });
    await admin.client.rpc("admin_set_game_status", { p_game_id: gameId, p_status: "canceled" });
    const deletedBefore = (await notificationsFor(a.id)).filter((n) => n.meta?.deleted === true);

    await admin.client.rpc("admin_delete_game", { p_game_id: gameId });

    // Canceling already told them, so deleting adds nothing; the notification tied to
    // the game goes with it.
    const after = await notificationsFor(a.id);
    expect(after.filter((n) => n.meta?.deleted === true)).toHaveLength(deletedBefore.length);
    expect(after.some((n) => n.game_id === gameId)).toBe(false);
  });

  it("does not notify anyone about a pelada that already happened", async () => {
    const gameId = await newGame();
    await a.client.rpc("join_game", { p_game_id: gameId });
    await setGameTimes(gameId, { opensInMs: -7_200_000, startsInMs: -3_600_000 });
    const before = (await notificationsFor(a.id)).filter((n) => n.meta?.deleted === true).length;

    await admin.client.rpc("admin_delete_game", { p_game_id: gameId });

    const after = (await notificationsFor(a.id)).filter((n) => n.meta?.deleted === true).length;
    expect(after).toBe(before);
  });

  it("is refused to a plain player, and the pelada stays", async () => {
    const gameId = await newGame();
    await a.client.rpc("join_game", { p_game_id: gameId });

    const { error } = await b.client.rpc("admin_delete_game", { p_game_id: gameId });
    expect(error?.message).toContain("FORBIDDEN");

    expect(await count("games", "id", gameId)).toBe(1);
    expect(await count("signups", "game_id", gameId)).toBe(1);
  });

  it("says so when the pelada does not exist", async () => {
    const { error } = await admin.client.rpc("admin_delete_game", {
      p_game_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error?.message).toContain("GAME_NOT_FOUND");
  });

  it("makes the list read as empty for someone who still has it open", async () => {
    const gameId = await newGame();
    const joined = await a.client.rpc("join_game", { p_game_id: gameId });
    const version = (joined.data as { version: number }).version;

    await admin.client.rpc("admin_delete_game", { p_game_id: gameId });

    const plain = await a.client.rpc("get_game_state", { p_game_id: gameId });
    expect(plain.error).toBeNull();
    expect(plain.data).toBeNull();

    // The "anything new?" poll must not claim nothing changed.
    const versioned = await a.client.rpc("get_game_state", {
      p_game_id: gameId,
      p_known_version: version,
    });
    expect(versioned.error).toBeNull();
    expect(versioned.data).toBeNull();

    const join = await b.client.rpc("join_game", { p_game_id: gameId });
    expect(join.error?.message).toContain("GAME_NOT_FOUND");
  });
});
