import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  approve,
  createGame,
  createTestUser,
  deleteGames,
  deleteUsers,
  makeAdmin,
  readProfile,
  readSignups,
  withSoleAdmin,
  type TestUser,
} from "./helpers/supabase";

describe("admin player management", () => {
  const users: string[] = [];
  const games: string[] = [];
  let admin: TestUser;

  beforeAll(async () => {
    admin = await createTestUser({ nickname: "Chefe" });
    users.push(admin.id);
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    await deleteGames(games);
    await deleteUsers(users);
  });

  describe("admin_update_player", () => {
    it("edits another player's name and nickname", async () => {
      const player = await createTestUser({ nickname: "Antigo" });
      users.push(player.id);
      await approve(player.id);

      const { error } = await admin.client.rpc("admin_update_player", {
        p_user_id: player.id,
        p_full_name: "Nome Corrigido",
        p_nickname: "Novo",
      });
      expect(error).toBeNull();

      const profile = await readProfile(player.id);
      expect(profile.full_name).toBe("Nome Corrigido");
      expect(profile.nickname).toBe("Novo");
    });

    it("validates the same way self-service editing does", async () => {
      const player = await createTestUser();
      users.push(player.id);

      const { error } = await admin.client.rpc("admin_update_player", {
        p_user_id: player.id,
        p_full_name: "Valido",
        p_nickname: "x",
      });
      expect(error?.message).toContain("INVALID_NICKNAME");
    });

    it("fails for a player that does not exist", async () => {
      const { error } = await admin.client.rpc("admin_update_player", {
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_full_name: "Alguem",
        p_nickname: "Alguem",
      });
      expect(error?.message).toContain("PLAYER_NOT_FOUND");
    });
  });

  describe("admin_prepare_player_deletion", () => {
    it("never leaves the app without an admin", async () => {
      await withSoleAdmin(admin.id, async () => {
        const { error } = await admin.client.rpc("admin_prepare_player_deletion", {
          p_user_id: admin.id,
        });
        expect(error?.message).toContain("LAST_ADMIN");
      });
    });

    it("takes the player off every active list and promotes the waitlist", async () => {
      const a = await createTestUser({ nickname: "A" });
      const b = await createTestUser({ nickname: "B" });
      users.push(a.id, b.id);
      await approve(a.id);
      await approve(b.id);

      const gameId = await createGame({ slots: 2 });
      games.push(gameId);

      const c = await createTestUser({ nickname: "C" });
      users.push(c.id);
      await approve(c.id);

      await a.client.rpc("join_game", { p_game_id: gameId });
      await b.client.rpc("join_game", { p_game_id: gameId });
      await c.client.rpc("join_game", { p_game_id: gameId });

      let signups = await readSignups(gameId);
      expect(signups.find((s) => s.user_id === a.id)?.status).toBe("confirmed");
      expect(signups.find((s) => s.user_id === b.id)?.status).toBe("confirmed");
      expect(signups.find((s) => s.user_id === c.id)?.status).toBe("waitlist");

      const { data, error } = await admin.client.rpc("admin_prepare_player_deletion", {
        p_user_id: a.id,
      });
      expect(error).toBeNull();
      expect((data as { affected_games: number }).affected_games).toBe(1);

      signups = await readSignups(gameId);
      expect(signups.find((s) => s.user_id === a.id)?.status).toBe("out");
      expect(signups.find((s) => s.user_id === b.id)?.status).toBe("confirmed");
      expect(signups.find((s) => s.user_id === c.id)?.status).toBe("confirmed");
    });

    it("is a no-op when the player has no active signup", async () => {
      const player = await createTestUser();
      users.push(player.id);
      await approve(player.id);

      const { data, error } = await admin.client.rpc("admin_prepare_player_deletion", {
        p_user_id: player.id,
      });
      expect(error).toBeNull();
      expect((data as { affected_games: number }).affected_games).toBe(0);
    });
  });
});
