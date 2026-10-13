import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  approve,
  createGame,
  createTestUser,
  deleteGames,
  deleteUsers,
  type GameState,
  type TestUser,
} from "./helpers/supabase";

/**
 * What keeps the opening second inside the Free plan: every change bumps the list
 * version, a client that already has it gets a few bytes back, and the database
 * sends at most one Realtime broadcast per pelada per quiet window, however many
 * people confirm inside it.
 */
describe("list version and coalesced broadcasts", () => {
  const users: string[] = [];
  const games: string[] = [];
  const players: TestUser[] = [];
  let db: Client;

  beforeAll(async () => {
    for (let index = 0; index < 6; index += 1) {
      const player = await createTestUser({ nickname: `Versao ${index}` });
      await approve(player.id);
      users.push(player.id);
      players.push(player);
    }

    const databaseUrl = process.env.SUPABASE_DB_URL;
    if (!databaseUrl) throw new Error("SUPABASE_DB_URL is required for this test");
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
    await deleteGames(games);
    await deleteUsers(users);
  });

  async function newGame(slots = 3) {
    const id = await createGame({ slots });
    games.push(id);
    return id;
  }

  /** The broadcasts the database queued for Realtime on this pelada's channel. */
  async function broadcasts(gameId: string) {
    const { rows } = await db.query<{ payload: { version: number; quiet_ms: number } }>(
      "select payload from realtime.messages where topic = $1 order by inserted_at",
      [`game:${gameId}`],
    );
    return rows.map((row) => row.payload);
  }

  it("bumps the version on every change, and only on changes", async () => {
    const gameId = await newGame();
    const [a, b] = players;

    const first = (await a.client.rpc("join_game", { p_game_id: gameId })).data as GameState;
    const second = (await b.client.rpc("join_game", { p_game_id: gameId })).data as GameState;
    expect(second.version).toBe(first.version + 1);

    // A double tap is not a change.
    const again = (await b.client.rpc("join_game", { p_game_id: gameId })).data as GameState;
    expect(again.version).toBe(second.version);

    const left = (await a.client.rpc("leave_game", { p_game_id: gameId })).data as GameState;
    expect(left.version).toBe(second.version + 1);
  });

  it("answers 'unchanged' in a few bytes when the caller is up to date", async () => {
    const gameId = await newGame();
    const [a, b] = players;

    const joined = (await a.client.rpc("join_game", { p_game_id: gameId })).data as GameState;

    const current = await b.client.rpc("get_game_state", {
      p_game_id: gameId,
      p_known_version: joined.version,
    });
    expect(current.error).toBeNull();
    expect(current.data).toMatchObject({ unchanged: true, version: joined.version });
    expect(new Date(current.data.server_time).getTime()).toBeGreaterThan(0);
    expect(JSON.stringify(current.data).length).toBeLessThan(120);

    // Behind by one: the whole state comes back.
    const behind = await b.client.rpc("get_game_state", {
      p_game_id: gameId,
      p_known_version: joined.version - 1,
    });
    const state = behind.data as GameState;
    expect(state.version).toBe(joined.version);
    expect(state.entries).toHaveLength(1);

    // Without a version it is the plain read it always was.
    const plain = (await b.client.rpc("get_game_state", { p_game_id: gameId })).data as GameState;
    expect(plain.entries).toHaveLength(1);
  });

  it("still refuses an unapproved caller, version or not", async () => {
    const gameId = await newGame();
    const pending = await createTestUser();
    users.push(pending.id);

    const { error } = await pending.client.rpc("get_game_state", {
      p_game_id: gameId,
      p_known_version: 0,
    });
    expect(error?.message).toContain("NOT_APPROVED");
  });

  it("sends one broadcast for a burst of confirmations, carrying the version", async () => {
    const gameId = await newGame(3);

    // Six people confirm in the same instant: six changes, one broadcast.
    const results = await Promise.all(
      players.map((player) => player.client.rpc("join_game", { p_game_id: gameId })),
    );
    expect(results.map((result) => result.error)).toEqual(results.map(() => null));

    const versions = results.map((result) => (result.data as GameState).version);
    expect(Math.max(...versions)).toBe(Math.min(...versions) + players.length - 1);

    const sent = await broadcasts(gameId);
    expect(sent).toHaveLength(1);
    expect(sent[0].version).toBe(Math.min(...versions));
    expect(sent[0].quiet_ms).toBeGreaterThan(0);
  });

  it("broadcasts again once the quiet window has passed", async () => {
    const gameId = await newGame(3);
    const [a, b] = players;

    await a.client.rpc("join_game", { p_game_id: gameId });
    const [first] = await broadcasts(gameId);

    await new Promise((resolve) => setTimeout(resolve, first.quiet_ms + 200));
    const later = (await b.client.rpc("join_game", { p_game_id: gameId })).data as GameState;

    const sent = await broadcasts(gameId);
    expect(sent).toHaveLength(2);
    expect(sent[1].version).toBe(later.version);
  });
});
