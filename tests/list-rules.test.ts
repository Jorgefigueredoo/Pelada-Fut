import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  approve,
  createGame,
  createTestUser,
  deleteGames,
  deleteUsers,
  makeAdmin,
  readSignups,
  setGameTimes,
  type GameState,
  type TestUser,
} from "./helpers/supabase";

/** Every rule from the spec's "Regras da lista", asserted against the database. */
describe("list rules", () => {
  const users: string[] = [];
  const games: string[] = [];
  let admin: TestUser;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let viewer: TestUser;

  beforeAll(async () => {
    admin = await createTestUser({ nickname: "Chefe", fullName: "Ana Chefe" });
    a = await createTestUser({ nickname: "Um", fullName: "Alberto Um" });
    b = await createTestUser({ nickname: "Dois", fullName: "Bruno Dois" });
    c = await createTestUser({ nickname: "Tres", fullName: "Carlos Tres" });
    viewer = await createTestUser({ nickname: "Olheiro", fullName: "Davi Olheiro" });
    users.push(admin.id, a.id, b.id, c.id, viewer.id);

    await makeAdmin(admin.id);
    await approve(a.id);
    await approve(b.id);
    await approve(c.id);
    await approve(viewer.id);
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

  it("refuses a confirmation before the list opens", async () => {
    const gameId = await newGame({ opensInMs: 60_000 });

    const { error } = await a.client.rpc("join_game", { p_game_id: gameId });
    expect(error?.message).toContain("LIST_NOT_OPEN");
    expect(await readSignups(gameId)).toHaveLength(0);
  });

  it("confirms by arrival order and sends the rest to the waitlist", async () => {
    const gameId = await newGame({ slots: 2 });

    await a.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });
    const { data } = await c.client.rpc("join_game", { p_game_id: gameId });

    const state = data as GameState;
    expect(state.my_signup?.status).toBe("waitlist");
    expect(state.my_signup?.position).toBe(3);

    const signups = await readSignups(gameId);
    expect(signups.map((s) => s.status)).toEqual(["confirmed", "confirmed", "waitlist"]);
    expect(signups.map((s) => s.seq)).toEqual([1, 2, 3]);
  });

  it("returns the position the server decided, and the server clock with it", async () => {
    const gameId = await newGame({ slots: 2 });

    const { data } = await a.client.rpc("join_game", { p_game_id: gameId });
    const state = data as GameState;

    expect(state.my_signup?.status).toBe("confirmed");
    expect(state.my_signup?.position).toBe(1);
    expect(new Date(state.server_time).getTime()).toBeGreaterThan(0);
    expect(state.game?.is_open).toBe(true);
  });

  it("promotes the first player on the waitlist the moment a confirmed one drops out", async () => {
    const gameId = await newGame({ slots: 2 });

    await a.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });
    await c.client.rpc("join_game", { p_game_id: gameId });

    await a.client.rpc("leave_game", { p_game_id: gameId });

    const signups = await readSignups(gameId);
    const byUser = new Map(signups.map((s) => [s.user_id, s]));
    expect(byUser.get(a.id)?.status).toBe("out");
    expect(byUser.get(b.id)?.status).toBe("confirmed");
    expect(byUser.get(c.id)?.status).toBe("confirmed");
    // The promotion is highlighted on the promoted player's own screen.
    expect(byUser.get(c.id)?.promoted_at).not.toBeNull();
  });

  it("sends a player who leaves and comes back to the end of the queue", async () => {
    const gameId = await newGame({ slots: 2 });

    await a.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });
    await a.client.rpc("leave_game", { p_game_id: gameId });
    await c.client.rpc("join_game", { p_game_id: gameId });

    const { data } = await a.client.rpc("join_game", { p_game_id: gameId });
    const state = data as GameState;

    expect(state.my_signup?.status).toBe("waitlist");
    expect(state.my_signup?.position).toBe(3);

    const active = (await readSignups(gameId)).filter((s) => s.status !== "out");
    expect(active.map((s) => s.user_id)).toEqual([b.id, c.id, a.id]);
  });

  it("does not duplicate on a double tap", async () => {
    const gameId = await newGame({ slots: 20 });

    const [first, second] = await Promise.all([
      a.client.rpc("join_game", { p_game_id: gameId }),
      a.client.rpc("join_game", { p_game_id: gameId }),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const active = (await readSignups(gameId)).filter((s) => s.status !== "out");
    expect(active).toHaveLength(1);
    expect((first.data as GameState).my_signup?.position).toBe(1);
    expect((second.data as GameState).my_signup?.position).toBe(1);
  });

  it("is also idempotent when leaving twice", async () => {
    const gameId = await newGame({ slots: 20 });
    await a.client.rpc("join_game", { p_game_id: gameId });

    const first = await a.client.rpc("leave_game", { p_game_id: gameId });
    const second = await a.client.rpc("leave_game", { p_game_id: gameId });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect((second.data as GameState).my_signup).toBeNull();
  });

  it("readjusts the list by arrival order when the admin changes the number of slots", async () => {
    const gameId = await newGame({ slots: 2 });

    await a.client.rpc("join_game", { p_game_id: gameId });
    await b.client.rpc("join_game", { p_game_id: gameId });
    await c.client.rpc("join_game", { p_game_id: gameId });

    // Three slots: the waitlisted player moves up.
    await admin.client.rpc("admin_update_game", {
      p_game_id: gameId,
      p_starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      p_location: "Quadra de teste",
      p_slots: 3,
      p_list_opens_at: new Date(Date.now() - 1000).toISOString(),
    });

    let signups = await readSignups(gameId);
    expect(signups.map((s) => s.status)).toEqual(["confirmed", "confirmed", "confirmed"]);

    // Back to one slot: the last two drop to the waitlist, in order.
    await admin.client.rpc("admin_update_game", {
      p_game_id: gameId,
      p_starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      p_location: "Quadra de teste",
      p_slots: 2,
      p_list_opens_at: new Date(Date.now() - 1000).toISOString(),
    });

    signups = await readSignups(gameId);
    expect(signups.map((s) => s.status)).toEqual(["confirmed", "confirmed", "waitlist"]);
    expect(signups[2].demoted_at).not.toBeNull();
  });

  it("stops players but not admins once the game has started", async () => {
    const gameId = await newGame({ slots: 20 });
    await a.client.rpc("join_game", { p_game_id: gameId });

    await setGameTimes(gameId, { startsInMs: -1000 });

    const join = await b.client.rpc("join_game", { p_game_id: gameId });
    expect(join.error?.message).toContain("GAME_STARTED");

    const leave = await a.client.rpc("leave_game", { p_game_id: gameId });
    expect(leave.error?.message).toContain("GAME_STARTED");

    const added = await admin.client.rpc("admin_add_player", {
      p_game_id: gameId,
      p_user_id: b.id,
    });
    expect(added.error).toBeNull();

    const removed = await admin.client.rpc("admin_remove_player", {
      p_game_id: gameId,
      p_user_id: a.id,
    });
    expect(removed.error).toBeNull();
  });

  it("freezes the list when the pelada is canceled, and restores it when reopened", async () => {
    const gameId = await newGame({ slots: 20 });
    await a.client.rpc("join_game", { p_game_id: gameId });

    await admin.client.rpc("admin_set_game_status", {
      p_game_id: gameId,
      p_status: "canceled",
    });

    const join = await b.client.rpc("join_game", { p_game_id: gameId });
    expect(join.error?.message).toContain("GAME_CANCELED");

    const leave = await a.client.rpc("leave_game", { p_game_id: gameId });
    expect(leave.error?.message).toContain("GAME_CANCELED");

    await admin.client.rpc("admin_set_game_status", {
      p_game_id: gameId,
      p_status: "scheduled",
    });

    // The list survived the cancellation untouched.
    const active = (await readSignups(gameId)).filter((s) => s.status !== "out");
    expect(active.map((s) => s.user_id)).toEqual([a.id]);
    expect((await b.client.rpc("join_game", { p_game_id: gameId })).error).toBeNull();
  });

  describe("admin managing the list", () => {
    it("reserves a slot before the list opens, marked for everyone to see", async () => {
      const gameId = await newGame({ slots: 20, opensInMs: 60_000 });

      const { error } = await admin.client.rpc("admin_add_player", {
        p_game_id: gameId,
        p_user_id: a.id,
      });
      expect(error).toBeNull();

      const { data } = await admin.client.rpc("get_game_state", { p_game_id: gameId });
      const state = data as GameState;
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].added_by_admin).toBe(true);
      expect(state.entries[0].status).toBe("confirmed");

      // And the mark is visible to a plain player too.
      const seenByPlayer = await b.client.rpc("get_game_state", { p_game_id: gameId });
      expect((seenByPlayer.data as GameState).entries[0].added_by_admin).toBe(true);
    });

    it("refuses to add a player who is not approved", async () => {
      const gameId = await newGame();
      const waiting = await createTestUser();
      users.push(waiting.id);

      const { error } = await admin.client.rpc("admin_add_player", {
        p_game_id: gameId,
        p_user_id: waiting.id,
      });
      expect(error?.message).toContain("PLAYER_NOT_APPROVED");
    });

    it("promotes from the waitlist when it removes a confirmed player", async () => {
      const gameId = await newGame({ slots: 2 });
      await a.client.rpc("join_game", { p_game_id: gameId });
      await b.client.rpc("join_game", { p_game_id: gameId });
      await c.client.rpc("join_game", { p_game_id: gameId });

      await admin.client.rpc("admin_remove_player", {
        p_game_id: gameId,
        p_user_id: a.id,
      });

      const byUser = new Map((await readSignups(gameId)).map((s) => [s.user_id, s]));
      expect(byUser.get(a.id)?.status).toBe("out");
      expect(byUser.get(b.id)?.status).toBe("confirmed");
      expect(byUser.get(c.id)?.status).toBe("confirmed");
      expect(byUser.get(c.id)?.promoted_at).not.toBeNull();
    });

    it("records every change in the history", async () => {
      const gameId = await newGame({ slots: 2 });
      await a.client.rpc("join_game", { p_game_id: gameId });
      await b.client.rpc("join_game", { p_game_id: gameId });
      await c.client.rpc("join_game", { p_game_id: gameId });
      await a.client.rpc("leave_game", { p_game_id: gameId });

      const { data, error } = await admin.client.rpc("get_game_history", {
        p_game_id: gameId,
      });
      expect(error).toBeNull();

      const history = data as Array<{ type: string; target_nickname: string | null }>;
      const types = history.map((h) => h.type);
      expect(types).toContain("joined");
      expect(types).toContain("left");
      expect(types).toContain("promoted");

      const promotion = history.find((h) => h.type === "promoted");
      expect(promotion?.target_nickname).toBe("Tres");
    });
  });

  describe("what the list shows", () => {
    it("gives every approved player the full list with seconds", async () => {
      const gameId = await newGame({ slots: 1 + 1 });
      await a.client.rpc("join_game", { p_game_id: gameId });
      await b.client.rpc("join_game", { p_game_id: gameId });
      await c.client.rpc("join_game", { p_game_id: gameId });

      const { data } = await viewer.client.rpc("get_game_state", { p_game_id: gameId });
      const state = data as GameState;

      expect(state.entries).toHaveLength(3);
      expect(state.entries[0]).toMatchObject({
        nickname: "Um",
        first_name: "Alberto",
        status: "confirmed",
        position: 1,
      });
      expect(state.entries[1]).toMatchObject({ nickname: "Dois", status: "confirmed", position: 2 });
      expect(state.entries[2]).toMatchObject({ nickname: "Tres", status: "waitlist", position: 3 });
      // Seconds are there, which is what settles the argument.
      expect(new Date(state.entries[0].joined_at).getMilliseconds()).toBeTypeOf("number");
      expect(state.my_signup).toBeNull();
    });

    it("never includes email or stars", async () => {
      const gameId = await newGame();
      await a.client.rpc("join_game", { p_game_id: gameId });

      const { data } = await b.client.rpc("get_game_state", { p_game_id: gameId });
      const serialized = JSON.stringify(data);

      expect(serialized).not.toContain("stars");
      expect(serialized).not.toContain("email");
      expect(serialized).not.toContain("@pelada.test");
    });

    it("shows the nearest pelada that has not finished yet", async () => {
      await adminClient()
        .from("games")
        .update({
          list_opens_at: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
          starts_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        })
        .in("id", games);

      const soon = await newGame({ slots: 5, startsInMs: 60 * 60 * 1000 });
      await newGame({ slots: 5, startsInMs: 48 * 60 * 60 * 1000 });

      const { data } = await a.client.rpc("get_next_game");
      expect((data as GameState).game?.id).toBe(soon);
    });

    it("lists every upcoming pelada, not just the nearest one", async () => {
      await adminClient()
        .from("games")
        .update({
          list_opens_at: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
          starts_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        })
        .in("id", games);

      const soon = await newGame({ slots: 5, startsInMs: 60 * 60 * 1000 });
      const later = await newGame({ slots: 5, startsInMs: 48 * 60 * 60 * 1000 });

      const { data, error } = await a.client.rpc("get_upcoming_games");
      expect(error).toBeNull();

      const upcoming = data as {
        server_time: string;
        games: GameState[];
      };
      const ids = upcoming.games.map((g) => g.game?.id);
      expect(ids).toEqual([soon, later]);
      expect(new Date(upcoming.server_time).getTime()).toBeGreaterThan(0);
    });

    it("upcoming games never leak another player's email or stars either", async () => {
      const gameId = await newGame();
      await a.client.rpc("join_game", { p_game_id: gameId });

      const { data } = await b.client.rpc("get_upcoming_games");
      const serialized = JSON.stringify(data);

      expect(serialized).not.toContain("stars");
      expect(serialized).not.toContain("email");
      expect(serialized).not.toContain("@pelada.test");
    });
  });
});
