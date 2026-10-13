import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOT_POLL_MS,
  isRetryableWriteError,
  ListSync,
  MAX_CLOCK_SAMPLE_AGE_MS,
  MAX_RETRY_MS,
  RESUBSCRIBE_SPREAD_MS,
  RETRY_MS,
  ServerClock,
  SPREAD_MS,
  writeRetryDelay,
} from "@/lib/list-sync";

const QUIET_MS = 3000;

/** One phone: records when each fetch started and shows whatever the "server" has. */
function phone(options: {
  random?: () => number;
  serverVersion?: () => number;
  ok?: () => boolean;
  startVersion?: number;
} = {}) {
  const starts: number[] = [];
  let shown: number | null = options.startVersion ?? 0;

  const sync = new ListSync({
    now: () => Date.now(),
    random: options.random ?? (() => 0.5),
    currentVersion: () => shown,
    fetch: async () => {
      starts.push(Date.now());
      if (options.ok && !options.ok()) return false;
      shown = options.serverVersion ? options.serverVersion() : shown;
      return true;
    },
  });

  return {
    sync,
    starts,
    shown: () => shown,
  };
}

describe("ListSync", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches after a broadcast with a newer version, spread instead of all at once", async () => {
    const p = phone({ random: () => 0.5, serverVersion: () => 1 });

    p.sync.onBroadcast(1, QUIET_MS);
    await vi.advanceTimersByTimeAsync(SPREAD_MS / 2 - 1);
    expect(p.starts).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(p.starts).toEqual([SPREAD_MS / 2]);
    expect(p.shown()).toBe(1);
  });

  it("spreads a hundred phones over the spread window", async () => {
    const starts: number[] = [];
    const phones = Array.from(
      { length: 100 },
      (_unused, index) =>
        new ListSync({
          now: () => Date.now(),
          random: () => index / 100,
          currentVersion: () => 0,
          fetch: async () => {
            starts.push(Date.now());
            return true;
          },
        }),
    );

    for (const sync of phones) sync.onBroadcast(1, QUIET_MS);
    await vi.advanceTimersByTimeAsync(SPREAD_MS);

    expect(starts).toHaveLength(100);
    const perTenth = new Map<number, number>();
    for (const start of starts) {
      const bucket = Math.floor(start / (SPREAD_MS / 10));
      perTenth.set(bucket, (perTenth.get(bucket) ?? 0) + 1);
    }
    expect(Math.max(...perTenth.values())).toBeLessThanOrEqual(10);

    for (const sync of phones) sync.dispose();
  });

  it("picks up a change made inside the quiet window, which gets no broadcast", async () => {
    let server = 1;
    const p = phone({ serverVersion: () => server });

    // t=0: a join, and its broadcast.
    p.sync.onBroadcast(1, QUIET_MS);
    await vi.advanceTimersByTimeAsync(1500);
    expect(p.shown()).toBe(1);

    // t=1.5s: another join. The database holds this broadcast back.
    server = 2;

    await vi.advanceTimersByTimeAsync(10_000);
    expect(p.shown()).toBe(2);
    expect(p.starts.some((start) => start >= QUIET_MS)).toBe(true);
  });

  it("goes quiet once a fetch has started after the window", async () => {
    const p = phone({ serverVersion: () => 1 });

    p.sync.onBroadcast(1, QUIET_MS);
    await vi.advanceTimersByTimeAsync(QUIET_MS + HOT_POLL_MS + SPREAD_MS);
    const settled = p.starts.length;
    expect(p.starts[settled - 1]).toBeGreaterThanOrEqual(QUIET_MS);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(p.starts).toHaveLength(settled);
  });

  it("polls about every two seconds during a sustained rush", async () => {
    let server = 0;
    const p = phone({ serverVersion: () => server });

    // A join every 100ms for 20s; the database broadcasts once per quiet window.
    let lastBroadcast = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 20_000; t += 100) {
      server += 1;
      if (t - lastBroadcast >= QUIET_MS) {
        lastBroadcast = t;
        p.sync.onBroadcast(server, QUIET_MS);
      }
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(QUIET_MS + HOT_POLL_MS + SPREAD_MS);

    // Fresh at the end, after a dozen fetches for 200 changes instead of one per change.
    expect(p.shown()).toBe(server);
    expect(p.starts.length).toBeLessThanOrEqual(12);
    const gaps = p.starts.slice(1).map((start, index) => start - p.starts[index]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(SPREAD_MS / 2);
  });

  it("does not refetch its own change right away, only the window after it", async () => {
    const p = phone({ startVersion: 5, serverVersion: () => 5 });

    p.sync.onBroadcast(5, QUIET_MS);
    await vi.advanceTimersByTimeAsync(HOT_POLL_MS - 1);
    expect(p.starts).toEqual([]);

    await vi.advanceTimersByTimeAsync(QUIET_MS + SPREAD_MS + HOT_POLL_MS);
    expect(p.starts.at(-1)).toBeGreaterThanOrEqual(QUIET_MS);
  });

  it("does not lose a broadcast that arrives while a fetch is in flight", async () => {
    let calls = 0;
    let release: (ok: boolean) => void = () => {};
    const sync = new ListSync({
      now: () => Date.now(),
      random: () => 0,
      currentVersion: () => 1,
      fetch: () => {
        calls += 1;
        if (calls === 1) return new Promise<boolean>((resolve) => (release = resolve));
        return Promise.resolve(true);
      },
    });

    sync.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);

    sync.onBroadcast(2, QUIET_MS);
    release(true);
    await vi.advanceTimersByTimeAsync(SPREAD_MS);
    expect(calls).toBe(2);

    sync.dispose();
  });

  it("backs off while the database keeps failing, up to a ceiling", async () => {
    const p = phone({ random: () => 0, ok: () => false });

    p.sync.poll();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await vi.advanceTimersByTimeAsync(2 * RETRY_MS);
    expect(p.starts).toEqual([0, RETRY_MS, 3 * RETRY_MS]);

    await vi.advanceTimersByTimeAsync(10 * MAX_RETRY_MS);
    const gaps = p.starts.slice(1).map((start, index) => start - p.starts[index]);
    expect(Math.max(...gaps)).toBe(MAX_RETRY_MS);
  });

  it("refreshes at once when asked, but not twice in a row on refocus", async () => {
    const p = phone();

    p.sync.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(1000);
    p.sync.refreshIfOlderThan(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(1500);
    p.sync.refreshIfOlderThan(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.starts).toEqual([0, 2500]);
  });

  it("fetches at once on the first subscription, and covers the open window", async () => {
    const p = phone({ random: () => 0.5 });

    p.sync.onSubscribed();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(QUIET_MS + HOT_POLL_MS + SPREAD_MS);
    expect(p.starts.at(-1)).toBeGreaterThanOrEqual(QUIET_MS);
  });

  it("spreads the fetch after a reconnection, when every phone reconnects at once", async () => {
    const p = phone({ random: () => 0.5 });

    p.sync.onSubscribed();
    await vi.advanceTimersByTimeAsync(60_000);
    const before = p.starts.length;

    p.sync.onSubscribed();
    await vi.advanceTimersByTimeAsync(RESUBSCRIBE_SPREAD_MS / 2 - 1);
    expect(p.starts).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.starts).toHaveLength(before + 1);
  });

  it("stops for good when disposed", async () => {
    const p = phone();

    p.sync.onBroadcast(1, QUIET_MS);
    p.sync.dispose();
    p.sync.poll();
    p.sync.refresh();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(p.starts).toEqual([]);
  });
});

describe("ServerClock", () => {
  it("assumes the request reached the database halfway through the round trip", () => {
    const clock = new ServerClock(0, 0);
    // Sent at 1000, answered at 1200: the database read its clock (10_000) at ~1100.
    clock.sample(10_000, 1000, 1200);
    expect(clock.at(1200)).toBe(10_100);
  });

  it("starts from the server render, and any timed sample replaces that", () => {
    const clock = new ServerClock(50_000, 1000);
    expect(clock.at(1000)).toBe(50_000);

    clock.sample(60_000, 2000, 4000);
    expect(clock.at(3000)).toBe(60_000);
  });

  it("keeps a fast sample over a slow one taken during the rush", () => {
    const clock = new ServerClock(0, 0);
    clock.sample(10_000, 1000, 1100);
    // A 3s round trip at the opening: its midpoint guess could be off by 1.5s.
    clock.sample(12_500, 2000, 5000);
    expect(clock.at(1100)).toBe(10_050);
  });

  it("takes a faster sample when one comes", () => {
    const clock = new ServerClock(0, 0);
    clock.sample(10_000, 1000, 1300);
    clock.sample(20_000, 11_000, 11_100);
    expect(clock.at(11_100)).toBe(20_050);
  });

  it("stops trusting an old sample, in case the phone's own clock was adjusted", () => {
    const clock = new ServerClock(0, 0);
    clock.sample(10_000, 1000, 1100);

    const later = 1100 + MAX_CLOCK_SAMPLE_AGE_MS + 1;
    clock.sample(900_000, later - 400, later);
    expect(clock.at(later)).toBe(900_200);
  });
});

describe("write retries", () => {
  it("retries what a retry can fix, and nothing else", () => {
    expect(isRetryableWriteError({ message: "TypeError: Failed to fetch" }, 0)).toBe(true);
    expect(isRetryableWriteError({ message: "AbortError: aborted" }, 0)).toBe(false);
    expect(isRetryableWriteError({ message: "Timed out acquiring connection" }, 504)).toBe(true);
    expect(isRetryableWriteError({ message: "Service Unavailable" }, 503)).toBe(true);
    expect(isRetryableWriteError({ message: "LIST_NOT_OPEN" }, 400)).toBe(true);
    expect(isRetryableWriteError({ message: "GAME_CANCELED" }, 400)).toBe(false);
    expect(isRetryableWriteError({ message: "NOT_APPROVED" }, 400)).toBe(false);
    expect(isRetryableWriteError(null, 200)).toBe(false);
  });

  it("waits a little, then a little more, never in lockstep", () => {
    expect(writeRetryDelay(1, () => 0)).toBe(300);
    expect(writeRetryDelay(1, () => 0.99)).toBeLessThan(600);
    expect(writeRetryDelay(2, () => 0)).toBe(900);
  });
});
