import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  approve,
  createTestUser,
  deleteUsers,
  makeAdmin,
  readProfile,
  withSoleAdmin,
  type TestUser,
} from "./helpers/supabase";

describe("profiles and approval", () => {
  const created: string[] = [];

  afterAll(async () => {
    await deleteUsers(created);
  });

  it("creates a pending player profile on signup, with the names from the form", async () => {
    const user = await createTestUser({ fullName: "Jorge Figueredo", nickname: "Jorginho" });
    created.push(user.id);

    const profile = await readProfile(user.id);
    expect(profile.role).toBe("player");
    expect(profile.status).toBe("pending");
    expect(profile.full_name).toBe("Jorge Figueredo");
    expect(profile.nickname).toBe("Jorginho");
  });

  it("ignores role and status sent by the client in the signup metadata", async () => {
    const user = await createTestUser({
      metadata: { role: "admin", status: "approved" },
    });
    created.push(user.id);

    const profile = await readProfile(user.id);
    expect(profile.role).toBe("player");
    expect(profile.status).toBe("pending");
  });

  it("stores the email where only an admin can read it", async () => {
    const user = await createTestUser();
    created.push(user.id);

    const { data } = await adminClient()
      .from("player_admin_data")
      .select("email, stars")
      .eq("user_id", user.id)
      .single();

    expect(data?.email).toBe(user.email);
    expect(data?.stars).toBeNull();
  });

  describe("update_my_profile", () => {
    let pending: TestUser;
    let approved: TestUser;

    beforeAll(async () => {
      pending = await createTestUser();
      approved = await createTestUser();
      created.push(pending.id, approved.id);
      await approve(approved.id);
    });

    it("lets an approved player change their own name and nickname", async () => {
      const { error } = await approved.client.rpc("update_my_profile", {
        p_full_name: "Nome Novo",
        p_nickname: "Apelido Novo",
      });
      expect(error).toBeNull();

      const profile = await readProfile(approved.id);
      expect(profile.full_name).toBe("Nome Novo");
      expect(profile.nickname).toBe("Apelido Novo");
    });

    it("refuses a pending player", async () => {
      const { error } = await pending.client.rpc("update_my_profile", {
        p_full_name: "Nome Novo",
        p_nickname: "Apelido Novo",
      });
      expect(error?.message).toContain("NOT_APPROVED");
    });

    it("refuses a nickname that is too short", async () => {
      const { error } = await approved.client.rpc("update_my_profile", {
        p_full_name: "Nome Valido",
        p_nickname: "x",
      });
      expect(error?.message).toContain("INVALID_NICKNAME");
    });
  });

  describe("admin actions", () => {
    let admin: TestUser;
    let player: TestUser;

    beforeAll(async () => {
      admin = await createTestUser({ nickname: "Chefe" });
      player = await createTestUser({ nickname: "Novato" });
      created.push(admin.id, player.id);
      await makeAdmin(admin.id);
    });

    it("approves and rejects a player", async () => {
      await admin.client.rpc("admin_set_user_status", {
        p_user_id: player.id,
        p_status: "approved",
      });
      expect((await readProfile(player.id)).status).toBe("approved");

      await admin.client.rpc("admin_set_user_status", {
        p_user_id: player.id,
        p_status: "rejected",
      });
      expect((await readProfile(player.id)).status).toBe("rejected");

      await admin.client.rpc("admin_set_user_status", {
        p_user_id: player.id,
        p_status: "approved",
      });
    });

    it("promotes and demotes another admin", async () => {
      const { error: promoteError } = await admin.client.rpc("admin_set_user_role", {
        p_user_id: player.id,
        p_role: "admin",
      });
      expect(promoteError).toBeNull();
      expect((await readProfile(player.id)).role).toBe("admin");

      const { error: demoteError } = await admin.client.rpc("admin_set_user_role", {
        p_user_id: player.id,
        p_role: "player",
      });
      expect(demoteError).toBeNull();
      expect((await readProfile(player.id)).role).toBe("player");
    });

    it("refuses to promote a player who is not approved yet", async () => {
      const waiting = await createTestUser();
      created.push(waiting.id);

      const { error } = await admin.client.rpc("admin_set_user_role", {
        p_user_id: waiting.id,
        p_role: "admin",
      });
      expect(error?.message).toContain("APPROVE_FIRST");
    });

    it("sets and clears stars", async () => {
      await admin.client.rpc("admin_set_stars", { p_user_id: player.id, p_stars: 4 });
      const { data: rated } = await adminClient()
        .from("player_admin_data")
        .select("stars")
        .eq("user_id", player.id)
        .single();
      expect(rated?.stars).toBe(4);

      await admin.client.rpc("admin_set_stars", { p_user_id: player.id, p_stars: null });
      const { data: cleared } = await adminClient()
        .from("player_admin_data")
        .select("stars")
        .eq("user_id", player.id)
        .single();
      expect(cleared?.stars).toBeNull();
    });

    it("refuses stars outside 1 to 5", async () => {
      const { error } = await admin.client.rpc("admin_set_stars", {
        p_user_id: player.id,
        p_stars: 9,
      });
      expect(error?.message).toContain("INVALID_STARS");
    });

    it("returns email and stars to an admin, paginated", async () => {
      const { data, error } = await admin.client.rpc("admin_list_players", {
        p_search: player.email,
      });
      expect(error).toBeNull();

      const page = data as {
        items: Array<{ id: string; email: string; stars: number | null }>;
        total: number;
        page: number;
        per_page: number;
      };
      expect(page.items).toHaveLength(1);
      expect(page.items[0].email).toBe(player.email);
      expect(page.items[0]).toHaveProperty("stars");
      expect(page.total).toBe(1);
      expect(page.page).toBe(1);
      expect(page.per_page).toBe(10);
    });

    it("paginates at 10 per page by default", async () => {
      const extras = await Promise.all(
        Array.from({ length: 15 }, () => createTestUser({ nickname: "PagTest" })),
      );
      created.push(...extras.map((u) => u.id));

      const firstPage = await admin.client.rpc("admin_list_players", {
        p_search: "PagTest",
      });
      const secondPage = await admin.client.rpc("admin_list_players", {
        p_search: "PagTest",
        p_page: 2,
      });

      const first = firstPage.data as { items: unknown[]; total: number };
      const second = secondPage.data as { items: unknown[]; total: number };

      expect(first.items).toHaveLength(10);
      expect(first.total).toBe(15);
      expect(second.items).toHaveLength(5);
      expect(second.total).toBe(15);
    });

    it("never lets the app run out of admins", async () => {
      await withSoleAdmin(admin.id, async () => {
        const demote = await admin.client.rpc("admin_set_user_role", {
          p_user_id: admin.id,
          p_role: "player",
        });
        expect(demote.error?.message).toContain("LAST_ADMIN");

        const block = await admin.client.rpc("admin_set_user_status", {
          p_user_id: admin.id,
          p_status: "blocked",
        });
        expect(block.error?.message).toContain("LAST_ADMIN");

        expect((await readProfile(admin.id)).role).toBe("admin");
        expect((await readProfile(admin.id)).status).toBe("approved");
      });
    });
  });
});
