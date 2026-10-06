import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, createGame, deleteGames, readSignups } from "./helpers/supabase";

/**
 * The test the spec cares most about: at the opening second dozens of people tap the
 * button inside the same moment. A naive implementation that counts the confirmed and
 * then inserts hands out a 21st slot.
 *
 * Two variants, because they can fail for different reasons:
 *   1. 60 authenticated supabase-js clients firing the RPC over HTTP, which is what
 *      really happens, PostgREST included.
 *   2. 60 separate Postgres connections calling the function directly, which puts more
 *      pressure on the row lock than HTTP can.
 */

const PLAYERS = 60;
const SLOTS = 20;
const ROUNDS = 5;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PASSWORD = "senha-de-teste-123";

type Player = { id: string; email: string; client: SupabaseClient };

async function createPlayers(count: number): Promise<Player[]> {
  const admin = adminClient();
  const suffix = randomUUID().slice(0, 6);

  const created = await Promise.all(
    Array.from({ length: count }, async (_unused, index) => {
      const email = `load-${suffix}-${index}@pelada.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: `Jogador ${index}`, nickname: `J${index}` },
      });
      if (error) throw error;
      return { id: data.user.id, email };
    }),
  );

  await admin
    .from("profiles")
    .update({ status: "approved" })
    .in(
      "id",
      created.map((player) => player.id),
    );

  // Sign everyone in, so the parallel burst later is pure RPC with no auth in the way.
  return Promise.all(
    created.map(async (player) => {
      const client = createClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await client.auth.signInWithPassword({
        email: player.email,
        password: PASSWORD,
      });
      if (error) throw error;
      return { ...player, client };
    }),
  );
}

/** The checks from the spec's definition of done, run on one round. */
async function assertFairList(gameId: string, players: Player[]) {
  const signups = await readSignups(gameId);

  expect(signups).toHaveLength(players.length);

  const confirmed = signups.filter((s) => s.status === "confirmed");
  const waitlist = signups.filter((s) => s.status === "waitlist");
  expect(confirmed).toHaveLength(SLOTS);
  expect(waitlist).toHaveLength(players.length - SLOTS);

  // Arrival order: 1..60, no gap, no repeat.
  const seqs = signups.map((s) => s.seq).sort((x, y) => x - y);
  expect(seqs).toEqual(Array.from({ length: players.length }, (_unused, i) => i + 1));

  // One signup per player.
  expect(new Set(signups.map((s) => s.user_id)).size).toBe(players.length);

  // The confirmed are exactly the first SLOTS by arrival, not an arbitrary subset.
  const bySeq = [...signups].sort((x, y) => x.seq - y.seq);
  expect(bySeq.slice(0, SLOTS).every((s) => s.status === "confirmed")).toBe(true);
  expect(bySeq.slice(SLOTS).every((s) => s.status === "waitlist")).toBe(true);

  // The displayed time never contradicts the order, which is why the function reads
  // clock_timestamp() after the lock instead of now().
  const times = bySeq.map((s) => new Date(s.joined_at).getTime());
  for (let i = 1; i < times.length; i += 1) {
    expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  }
}

describe("concurrency at the opening second", () => {
  const games: string[] = [];
  let players: Player[];

  beforeAll(async () => {
    players = await createPlayers(PLAYERS);
  }, 180_000);

  afterAll(async () => {
    await deleteGames(games);
    const admin = adminClient();
    await Promise.all(players.map((player) => admin.auth.admin.deleteUser(player.id)));
  }, 180_000);

  it(
    `gives exactly ${SLOTS} slots to ${PLAYERS} simultaneous taps over HTTP, ${ROUNDS} times`,
    async () => {
      for (let round = 1; round <= ROUNDS; round += 1) {
        const gameId = await createGame({ slots: SLOTS });
        games.push(gameId);

        const started = Date.now();
        // Every request is issued in the same tick, so all 60 are in flight at once.
        const results = await Promise.all(
          players.map((player) => player.client.rpc("join_game", { p_game_id: gameId })),
        );
        const elapsed = Date.now() - started;

        const failures = results.filter((result) => result.error);
        expect(
          failures.map((f) => f.error?.message),
          `round ${round} had failed calls`,
        ).toEqual([]);

        await assertFairList(gameId, players);

        // Each caller was told the truth about its own position.
        const reported = results.map(
          (result) => (result.data as { my_signup: { position: number } }).my_signup.position,
        );
        expect([...reported].sort((x, y) => x - y)).toEqual(
          Array.from({ length: PLAYERS }, (_unused, i) => i + 1),
        );

        console.log(
          `  round ${round}: ${PLAYERS} parallel joins in ${elapsed}ms ` +
            `(${(elapsed / PLAYERS).toFixed(1)}ms per join)`,
        );
      }
    },
    300_000,
  );

  it(
    `holds with ${PLAYERS} real Postgres connections hitting the lock directly`,
    async () => {
      const databaseUrl = process.env.SUPABASE_DB_URL;
      expect(databaseUrl, "SUPABASE_DB_URL is required for this test").toBeTruthy();

      const gameId = await createGame({ slots: SLOTS });
      games.push(gameId);

      const connections = players.map(() => new Client({ connectionString: databaseUrl }));
      await Promise.all(connections.map((connection) => connection.connect()));

      try {
        const started = Date.now();
        await Promise.all(
          connections.map(async (connection, index) => {
            // Exactly what PostgREST does for a signed-in caller.
            await connection.query("begin");
            await connection.query("set local role authenticated");
            await connection.query("select set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: players[index].id, role: "authenticated" }),
            ]);
            await connection.query("select public.join_game($1)", [gameId]);
            await connection.query("commit");
          }),
        );
        const elapsed = Date.now() - started;

        await assertFairList(gameId, players);
        console.log(
          `  direct: ${PLAYERS} parallel connections in ${elapsed}ms ` +
            `(${(elapsed / PLAYERS).toFixed(1)}ms per join)`,
        );
      } finally {
        await Promise.all(connections.map((connection) => connection.end()));
      }
    },
    300_000,
  );
});
