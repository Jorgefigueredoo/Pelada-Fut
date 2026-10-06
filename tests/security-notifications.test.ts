import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  anonClient,
  approve,
  createTestUser,
  deleteUsers,
  makeAdmin,
  type TestUser,
} from "./helpers/supabase";

describe("notification security with the publishable key", () => {
  const users: string[] = [];
  let anon: ReturnType<typeof anonClient>;
  let admin: TestUser;
  let player: TestUser;
  let other: TestUser;
  let pending: TestUser;

  beforeAll(async () => {
    anon = anonClient();
    admin = await createTestUser({ nickname: "Chefe" });
    player = await createTestUser({ nickname: "Comum" });
    other = await createTestUser({ nickname: "Outro" });
    pending = await createTestUser({ nickname: "Pendente" });
    users.push(admin.id, player.id, other.id, pending.id);

    await makeAdmin(admin.id);
    await approve(player.id);
    await approve(other.id);

    // A notification that belongs to `other`, to try to read as `player`.
    await admin.client.rpc("admin_set_user_status", {
      p_user_id: other.id,
      p_status: "approved",
    });
  });

  afterAll(async () => {
    await deleteUsers(users);
  });

  it("reads no notifications without a session", async () => {
    const { data, error } = await anon.from("notifications").select("id");
    expect(error ?? data?.length === 0).toBeTruthy();
  });

  it("cannot call get_my_notifications without a session", async () => {
    const { error } = await anon.rpc("get_my_notifications");
    expect(error).not.toBeNull();
  });

  it("only ever sees its own notifications, never another player's", async () => {
    const { data } = await player.client.from("notifications").select("user_id");
    expect((data ?? []).every((row) => row.user_id === player.id)).toBe(true);

    const { data: fromRpc } = await player.client.rpc("get_my_notifications");
    const otherIds = (fromRpc.items as Array<{ id: number }>).map((n) => n.id);
    const { data: othersNotifications } = await adminClient()
      .from("notifications")
      .select("id")
      .eq("user_id", other.id);
    const otherOwnedIds = new Set((othersNotifications ?? []).map((n) => n.id));
    expect(otherIds.some((id) => otherOwnedIds.has(id))).toBe(false);
  });

  it("cannot insert, update or delete a notification directly", async () => {
    const insert = await player.client.from("notifications").insert({
      user_id: player.id,
      type: "approved",
    });
    expect(insert.error).not.toBeNull();

    const update = await player.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", player.id);
    expect(update.error).not.toBeNull();

    const del = await player.client.from("notifications").delete().eq("user_id", player.id);
    expect(del.error).not.toBeNull();
  });

  it("cannot call the internal _notify helper", async () => {
    const { error } = await player.client.rpc("_notify", {
      p_user_id: player.id,
      p_type: "approved",
      p_game_id: null,
      p_meta: {},
    });
    expect(error).not.toBeNull();
  });

  it("cannot mark another player's notifications read", async () => {
    // mark_all_notifications_read only ever touches auth.uid()'s own rows: calling
    // it as `player` must never affect `other`'s unread count.
    const before = await adminClient()
      .from("notifications")
      .select("id")
      .eq("user_id", other.id)
      .is("read_at", null);

    await player.client.rpc("mark_all_notifications_read");

    const after = await adminClient()
      .from("notifications")
      .select("id")
      .eq("user_id", other.id)
      .is("read_at", null);

    expect(after.data?.length).toBe(before.data?.length);
  });

  it("refuses a pending user", async () => {
    const read = await pending.client.rpc("get_my_notifications");
    expect(read.error?.message).toContain("NOT_APPROVED");

    const mark = await pending.client.rpc("mark_all_notifications_read");
    expect(mark.error?.message).toContain("NOT_APPROVED");
  });
});
