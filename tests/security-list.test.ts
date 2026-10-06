import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  anonClient,
  approve,
  createGame,
  createTestUser,
  deleteGames,
  deleteUsers,
  readSignups,
  type TestUser,
} from "./helpers/supabase";

/** The list is only writable through the functions. This file tries every other door. */
describe("list security with the publishable key", () => {
  const users: string[] = [];
  const games: string[] = [];
  let anon: ReturnType<typeof anonClient>;
  let player: TestUser;
  let pending: TestUser;
  let blocked: TestUser;
  let gameId: string;

  beforeAll(async () => {
    anon = anonClient();
    player = await createTestUser({ nickname: "Comum" });
    pending = await createTestUser({ nickname: "Pendente" });
    blocked = await createTestUser({ nickname: "Bloqueado" });
    users.push(player.id, pending.id, blocked.id);

    await approve(player.id);
    await approve(blocked.id);
    await adminClient().from("profiles").update({ status: "blocked" }).eq("id", blocked.id);

    gameId = await createGame({ slots: 2 });
    games.push(gameId);
  });

  afterAll(async () => {
    await deleteGames(games);
    await deleteUsers(users);
  });

  describe("an approved player", () => {
    it("cannot read the signups table directly", async () => {
      const { data, error } = await player.client.from("signups").select("user_id, seq");
      expect(error ?? data?.length === 0).toBeTruthy();
    });

    it("cannot insert a signup, which is the whole point", async () => {
      const { error } = await player.client.from("signups").insert({
        game_id: gameId,
        user_id: player.id,
        seq: 1,
        status: "confirmed",
        joined_at: new Date().toISOString(),
      });
      expect(error).not.toBeNull();
      expect(await readSignups(gameId)).toHaveLength(0);
    });

    it("cannot jump the queue by editing a signup", async () => {
      await player.client.rpc("join_game", { p_game_id: gameId });

      const { error } = await player.client
        .from("signups")
        .update({ seq: 0, status: "confirmed" })
        .eq("game_id", gameId);
      expect(error).not.toBeNull();

      const signups = await readSignups(gameId);
      expect(signups[0].seq).toBe(1);
    });

    it("cannot delete a signup", async () => {
      const { error } = await player.client.from("signups").delete().eq("game_id", gameId);
      expect(error).not.toBeNull();
    });

    it("cannot create or change a pelada", async () => {
      const insert = await player.client.from("games").insert({
        slots: 20,
        location: "Minha quadra",
        list_opens_at: new Date().toISOString(),
        starts_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(insert.error).not.toBeNull();

      const update = await player.client
        .from("games")
        .update({ slots: 99, list_opens_at: new Date(0).toISOString() })
        .eq("id", gameId);
      expect(update.error).not.toBeNull();
    });

    it("cannot read the history", async () => {
      const { data, error } = await player.client.from("signup_events").select("type");
      expect(error ?? data?.length === 0).toBeTruthy();
    });

    it("is refused by every admin function", async () => {
      const calls = await Promise.all([
        player.client.rpc("admin_add_player", { p_game_id: gameId, p_user_id: player.id }),
        player.client.rpc("admin_remove_player", { p_game_id: gameId, p_user_id: player.id }),
        player.client.rpc("admin_set_game_status", { p_game_id: gameId, p_status: "canceled" }),
        player.client.rpc("admin_list_games"),
        player.client.rpc("get_game_history", { p_game_id: gameId }),
        player.client.rpc("get_app_settings"),
        player.client.rpc("admin_create_game", {
          p_starts_at: new Date(Date.now() + 3_600_000).toISOString(),
          p_location: "Minha quadra",
          p_slots: 20,
          p_list_opens_at: new Date().toISOString(),
        }),
        player.client.rpc("admin_update_game", {
          p_game_id: gameId,
          p_starts_at: new Date(Date.now() + 3_600_000).toISOString(),
          p_location: "Minha quadra",
          p_slots: 99,
          p_list_opens_at: new Date().toISOString(),
        }),
      ]);

      for (const call of calls) {
        expect(call.error?.message).toContain("FORBIDDEN");
      }

      const { data: game } = await adminClient()
        .from("games")
        .select("slots, status")
        .eq("id", gameId)
        .single();
      expect(game?.slots).toBe(2);
      expect(game?.status).toBe("scheduled");
    });

    it("cannot call the internal helpers", async () => {
      const calls = await Promise.all([
        player.client.rpc("_reconcile_game", {
          p_game_id: gameId,
          p_actor: player.id,
          p_at: new Date().toISOString(),
        }),
        player.client.rpc("_broadcast_game", { p_game_id: gameId }),
        player.client.rpc("_game_state", {
          p_game_id: gameId,
          p_user_id: player.id,
          p_now: new Date().toISOString(),
        }),
      ]);

      for (const call of calls) {
        expect(call.error).not.toBeNull();
      }
    });
  });

  describe("a pending or blocked user", () => {
    it("cannot read the list", async () => {
      for (const user of [pending, blocked]) {
        const state = await user.client.rpc("get_game_state", { p_game_id: gameId });
        expect(state.error?.message).toContain("NOT_APPROVED");

        const next = await user.client.rpc("get_next_game");
        expect(next.error?.message).toContain("NOT_APPROVED");

        const upcoming = await user.client.rpc("get_upcoming_games");
        expect(upcoming.error?.message).toContain("NOT_APPROVED");
      }
    });

    it("cannot confirm", async () => {
      for (const user of [pending, blocked]) {
        const { error } = await user.client.rpc("join_game", { p_game_id: gameId });
        expect(error?.message).toContain("NOT_APPROVED");
      }
    });

    it("cannot read which peladas exist", async () => {
      const { data, error } = await pending.client.from("games").select("id");
      expect(error ?? data?.length === 0).toBeTruthy();
    });
  });

  describe("no session at all", () => {
    it("cannot confirm or read the list", async () => {
      const calls = await Promise.all([
        anon.rpc("join_game", { p_game_id: gameId }),
        anon.rpc("leave_game", { p_game_id: gameId }),
        anon.rpc("get_game_state", { p_game_id: gameId }),
        anon.rpc("get_next_game"),
        anon.rpc("get_upcoming_games"),
      ]);

      for (const call of calls) {
        expect(call.error).not.toBeNull();
      }
    });

    it("reads no pelada and no signup", async () => {
      const games = await anon.from("games").select("id");
      expect(games.error ?? games.data?.length === 0).toBeTruthy();

      const signups = await anon.from("signups").select("user_id");
      expect(signups.error ?? signups.data?.length === 0).toBeTruthy();
    });
  });
});
