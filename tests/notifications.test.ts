import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  approve,
  createGame,
  createTestUser,
  deleteGames,
  deleteUsers,
  makeAdmin,
  type TestUser,
} from "./helpers/supabase";

type NotificationPage = {
  items: Array<{
    id: number;
    type: string;
    meta: Record<string, unknown>;
    created_at: string;
    read_at: string | null;
    game: { id: string; starts_at: string; location: string } | null;
  }>;
  unread_count: number;
};

async function getNotifications(user: TestUser): Promise<NotificationPage> {
  const { data, error } = await user.client.rpc("get_my_notifications");
  if (error) throw error;
  return data as NotificationPage;
}

describe("in-app notifications", () => {
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
  });

  afterAll(async () => {
    await deleteGames(games);
    await deleteUsers(users);
  });

  it("notifies a player when their account is approved", async () => {
    const waiting = await createTestUser();
    users.push(waiting.id);

    // Still pending, so it cannot call get_my_notifications yet (NOT_APPROVED) —
    // check directly instead that nothing was notified before the approval.
    const before = await adminClient()
      .from("notifications")
      .select("id")
      .eq("user_id", waiting.id);
    expect(before.data).toHaveLength(0);

    await admin.client.rpc("admin_set_user_status", {
      p_user_id: waiting.id,
      p_status: "approved",
    });

    const after = await getNotifications(waiting);
    expect(after.items).toHaveLength(1);
    expect(after.items[0].type).toBe("approved");
    expect(after.unread_count).toBe(1);

    // Approving again (already approved) must not notify a second time.
    await admin.client.rpc("admin_set_user_status", {
      p_user_id: waiting.id,
      p_status: "approved",
    });
    expect((await getNotifications(waiting)).items).toHaveLength(1);
  });

  it("notifies a player promoted from the waitlist, with the game attached", async () => {
    await approve(a.id);
    await approve(b.id);
    const gameId = await createGame({ slots: 2 });
    games.push(gameId);

    const filler = await createTestUser();
    users.push(filler.id);
    await approve(filler.id);

    await a.client.rpc("join_game", { p_game_id: gameId });
    await filler.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });

    await a.client.rpc("leave_game", { p_game_id: gameId });

    const { items } = await getNotifications(b);
    const promoted = items.find((n) => n.type === "promoted");
    expect(promoted).toBeDefined();
    expect(promoted?.game?.id).toBe(gameId);
    expect(promoted?.meta.position).toBe(2);
  });

  it("notifies a player added or removed by an admin", async () => {
    const player = await createTestUser();
    users.push(player.id);
    await approve(player.id);

    const gameId = await createGame({ slots: 20 });
    games.push(gameId);

    await admin.client.rpc("admin_add_player", { p_game_id: gameId, p_user_id: player.id });
    let notifications = await getNotifications(player);
    expect(notifications.items.map((n) => n.type)).toContain("admin_added");

    await admin.client.rpc("admin_remove_player", { p_game_id: gameId, p_user_id: player.id });
    notifications = await getNotifications(player);
    expect(notifications.items.map((n) => n.type)).toContain("admin_removed");
  });

  it("notifies every active participant when a pelada is canceled, not someone who left", async () => {
    const stayed = await createTestUser();
    const left = await createTestUser();
    users.push(stayed.id, left.id);
    await approve(stayed.id);
    await approve(left.id);

    const gameId = await createGame({ slots: 20 });
    games.push(gameId);

    await stayed.client.rpc("join_game", { p_game_id: gameId });
    await left.client.rpc("join_game", { p_game_id: gameId });
    await left.client.rpc("leave_game", { p_game_id: gameId });

    await admin.client.rpc("admin_set_game_status", {
      p_game_id: gameId,
      p_status: "canceled",
    });

    expect(
      (await getNotifications(stayed)).items.map((n) => n.type),
    ).toContain("game_canceled");
    expect(
      (await getNotifications(left)).items.map((n) => n.type),
    ).not.toContain("game_canceled");

    await admin.client.rpc("admin_set_game_status", {
      p_game_id: gameId,
      p_status: "scheduled",
    });
    expect(
      (await getNotifications(stayed)).items.map((n) => n.type),
    ).toContain("game_reopened");
  });

  it("does not notify twice when setting the same status again", async () => {
    const player = await createTestUser();
    users.push(player.id);
    await approve(player.id);

    const gameId = await createGame({ slots: 20 });
    games.push(gameId);
    await player.client.rpc("join_game", { p_game_id: gameId });

    await admin.client.rpc("admin_set_game_status", { p_game_id: gameId, p_status: "canceled" });
    await admin.client.rpc("admin_set_game_status", { p_game_id: gameId, p_status: "canceled" });

    const count = (await getNotifications(player)).items.filter(
      (n) => n.type === "game_canceled",
    ).length;
    expect(count).toBe(1);
  });

  it("marks every notification read at once, and only for the caller", async () => {
    const player = await createTestUser();
    users.push(player.id);
    await approve(player.id);

    const gameId = await createGame({ slots: 20 });
    games.push(gameId);
    await admin.client.rpc("admin_add_player", { p_game_id: gameId, p_user_id: player.id });

    expect((await getNotifications(player)).unread_count).toBeGreaterThan(0);

    const { error } = await player.client.rpc("mark_all_notifications_read");
    expect(error).toBeNull();

    const after = await getNotifications(player);
    expect(after.unread_count).toBe(0);
    expect(after.items.every((n) => n.read_at !== null)).toBe(true);
  });
});
