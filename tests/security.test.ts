import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  anonClient,
  approve,
  createTestUser,
  deleteUsers,
  makeAdmin,
  readProfile,
  type TestUser,
} from "./helpers/supabase";

/**
 * Everything here uses the publishable key, which is public by design.
 * A read is denied when it errors or comes back empty; a write must error.
 */
describe("security with the publishable key", () => {
  const created: string[] = [];
  let anon: ReturnType<typeof anonClient>;
  let pending: TestUser;
  let player: TestUser;
  let other: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    anon = anonClient();
    pending = await createTestUser({ nickname: "Pendente" });
    player = await createTestUser({ nickname: "Comum" });
    other = await createTestUser({ nickname: "Outro" });
    admin = await createTestUser({ nickname: "Admin" });
    created.push(pending.id, player.id, other.id, admin.id);

    await approve(player.id);
    await approve(other.id);
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    await deleteUsers(created);
  });

  describe("no session at all", () => {
    it("reads no profile", async () => {
      const { data, error } = await anon.from("profiles").select("id, nickname");
      expect(error ?? data?.length === 0).toBeTruthy();
    });

    it("reads no stars or email", async () => {
      const { data, error } = await anon.from("player_admin_data").select("email, stars");
      expect(error ?? data?.length === 0).toBeTruthy();
    });

    it("cannot execute the profile function", async () => {
      const { error } = await anon.rpc("update_my_profile", {
        p_full_name: "Invasor",
        p_nickname: "Invasor",
      });
      expect(error).not.toBeNull();
    });

    it("cannot execute an admin function", async () => {
      const { error } = await anon.rpc("admin_list_players", { p_search: null });
      expect(error).not.toBeNull();
    });
  });

  describe("pending user", () => {
    it("reads their own profile", async () => {
      const { data, error } = await pending.client
        .from("profiles")
        .select("id, status")
        .eq("id", pending.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.status).toBe("pending");
    });

    it("reads nothing else", async () => {
      const { data } = await pending.client.from("profiles").select("id");
      expect(data?.map((row) => row.id)).toEqual([pending.id]);
    });

    it("reads no settings", async () => {
      const { data, error } = await pending.client.from("app_settings").select("default_slots");
      expect(error ?? data?.length === 0).toBeTruthy();
    });
  });

  describe("approved player", () => {
    it("cannot read another player's profile row", async () => {
      const { data } = await player.client.from("profiles").select("id").eq("id", other.id);
      expect(data ?? []).toHaveLength(0);
    });

    it("cannot read stars, not even their own", async () => {
      const { data, error } = await player.client
        .from("player_admin_data")
        .select("stars")
        .eq("user_id", player.id);
      expect(error ?? data?.length === 0).toBeTruthy();
    });

    it("cannot make themselves admin through the table", async () => {
      const { error } = await player.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", player.id);
      expect(error).not.toBeNull();
      expect((await readProfile(player.id)).role).toBe("player");
    });

    it("cannot change their own status through the table", async () => {
      const { error } = await player.client
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", player.id);
      expect(error).not.toBeNull();
    });

    it("cannot insert a profile", async () => {
      const { error } = await player.client.from("profiles").insert({
        id: crypto.randomUUID(),
        full_name: "Fantasma",
        nickname: "Fantasma",
        role: "admin",
        status: "approved",
      });
      expect(error).not.toBeNull();
    });

    it("cannot delete their own profile row", async () => {
      const { error } = await player.client.from("profiles").delete().eq("id", player.id);
      expect(error).not.toBeNull();
      expect((await readProfile(player.id)).id).toBe(player.id);
    });

    it("cannot write stars", async () => {
      const { error } = await player.client
        .from("player_admin_data")
        .update({ stars: 5 })
        .eq("user_id", player.id);
      expect(error).not.toBeNull();
    });

    it("cannot change the group settings", async () => {
      const { error } = await player.client
        .from("app_settings")
        .update({ default_slots: 99 })
        .eq("id", true);
      expect(error).not.toBeNull();
    });

    it("is refused by every admin function", async () => {
      const calls = await Promise.all([
        player.client.rpc("admin_list_players", { p_search: null }),
        player.client.rpc("admin_set_user_role", { p_user_id: player.id, p_role: "admin" }),
        player.client.rpc("admin_set_user_status", {
          p_user_id: player.id,
          p_status: "approved",
        }),
        player.client.rpc("admin_set_stars", { p_user_id: player.id, p_stars: 5 }),
      ]);

      for (const call of calls) {
        expect(call.error?.message).toContain("FORBIDDEN");
      }
      expect((await readProfile(player.id)).role).toBe("player");
    });
  });

  describe("admin", () => {
    it("reads every profile", async () => {
      const { data, error } = await admin.client.from("profiles").select("id");
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThanOrEqual(4);
    });

    it("still cannot write to profiles directly", async () => {
      const { error } = await admin.client
        .from("profiles")
        .update({ role: "player" })
        .eq("id", admin.id);
      expect(error).not.toBeNull();
    });
  });
});
