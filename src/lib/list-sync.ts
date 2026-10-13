/**
 * When a phone refetches a pelada's list, and what time the database thinks it is.
 * No React and no Supabase in here, so both can be tested with fake timers.
 *
 * The opening second is the whole problem: a hundred phones watching the same list
 * while it changes several times a second, on the Supabase Free plan. So:
 *
 *   - The database sends at most one Realtime broadcast per pelada every `quiet_ms`
 *     (see _broadcast_game). The Free plan caps Realtime at 100 messages per second
 *     and each broadcast costs one message per phone, so one broadcast per join got
 *     every connection dropped. A change made inside that window has no broadcast of
 *     its own, so after any broadcast the phone keeps polling until one fetch has
 *     started after the window closed. Nothing is lost; it just arrives by poll.
 *   - Fetches triggered by a broadcast are spread over a second, so a hundred phones
 *     do not all hit the database in the same millisecond.
 *   - Every fetch sends the version the phone already has, and the database answers
 *     "unchanged" in a few bytes when that is still current.
 */

/** Used until a broadcast says otherwise; the database owns the real number. */
export const DEFAULT_QUIET_MS = 3000;
/** How often to poll while a quiet window is open. */
export const HOT_POLL_MS = 2000;
/** Fetches triggered by a broadcast are spread over this much time. */
export const SPREAD_MS = 1000;
/** After a reconnection every phone resubscribes at once, so spread wider. */
export const RESUBSCRIBE_SPREAD_MS = 2000;
/** A failed fetch is retried after this, doubling on every failure in a row. */
export const RETRY_MS = 3000;
/** The retry delay never grows past this, so the list recovers soon after the database. */
export const MAX_RETRY_MS = 30_000;

export type ListSyncOptions = {
  /** Fetches the list and applies it. Resolves to false when the request failed. */
  fetch: () => Promise<boolean>;
  /** The version this phone already shows, or null when it has none. */
  currentVersion: () => number | null;
  now?: () => number;
  random?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class ListSync {
  private readonly fetchList: () => Promise<boolean>;
  private readonly currentVersion: () => number | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  private quietMs = DEFAULT_QUIET_MS;
  /** Something changed at this moment: owed a fetch that starts after it. */
  private dirtySince = Number.NEGATIVE_INFINITY;
  /**
   * A quiet window is open until this moment: owed a fetch that starts no earlier.
   * One that starts right at it is enough, since it reaches the database later still.
   */
  private hotUntil = Number.NEGATIVE_INFINITY;
  private lastSuccessStart = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private inFlight = false;
  private timer: unknown = null;
  private dueAt = Number.POSITIVE_INFINITY;
  private subscribedBefore = false;
  private disposed = false;

  constructor(options: ListSyncOptions) {
    this.fetchList = options.fetch;
    this.currentVersion = options.currentVersion;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** A `list_changed` broadcast arrived. */
  onBroadcast(version?: number, quietMs?: number): void {
    if (this.disposed) return;
    if (typeof quietMs === "number" && quietMs > 0) this.quietMs = quietMs;

    const now = this.now();
    this.hotUntil = Math.max(this.hotUntil, now + this.quietMs);

    // A phone that made the change itself already shows it: only the window is owed.
    const known = this.currentVersion();
    if (typeof version !== "number" || known === null || version > known) {
      this.dirtySince = now;
    }
    this.plan(SPREAD_MS);
  }

  /**
   * The channel (re)connected. Anything may have changed while it was down, and a
   * broadcast sent just before it connected may still have its window open.
   *
   * The first time, fetch at once: page loads are spread out on their own, and this
   * fetch is also what corrects the clock seeded by the server render, which matters
   * to someone who opened the app seconds before the list opens. A reconnection, on
   * the other hand, happens to every phone at the same moment, so it is spread.
   */
  onSubscribed(): void {
    if (this.disposed) return;
    const now = this.now();
    this.dirtySince = now;
    this.hotUntil = Math.max(this.hotUntil, now + this.quietMs);
    this.plan(this.subscribedBefore ? RESUBSCRIBE_SPREAD_MS : 0);
    this.subscribedBefore = true;
  }

  /** A periodic check: the fallback while the channel is down, or the safety net. */
  poll(): void {
    if (this.disposed) return;
    this.dirtySince = this.now();
    this.plan(SPREAD_MS);
  }

  /** Someone is looking and asked for it: no spreading. */
  refresh(): void {
    if (this.disposed) return;
    this.dirtySince = this.now();
    this.schedule(0);
  }

  /** Back to the app: refresh, unless the list was fetched a moment ago. */
  refreshIfOlderThan(ms: number): void {
    if (this.disposed) return;
    if (this.now() - this.lastSuccessStart < ms) return;
    this.refresh();
  }

  msSinceLastSuccess(): number {
    return this.now() - this.lastSuccessStart;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  /** Schedules the next fetch from what is still owed, if anything. */
  private plan(spreadMs: number): void {
    if (this.disposed || this.inFlight) return;

    const owesChange = this.dirtySince > this.lastSuccessStart;
    const owesWindow = Number.isFinite(this.hotUntil) && this.hotUntil > this.lastSuccessStart;
    if (!owesChange && !owesWindow) return;

    // Backing off matters most when the database is the thing that is struggling.
    if (this.failures > 0) {
      const backoff = Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** (this.failures - 1));
      this.schedule(backoff + this.spread(SPREAD_MS));
      return;
    }
    if (owesChange) {
      this.schedule(this.spread(spreadMs));
      return;
    }
    // Poll while the window is open, then once more as it closes.
    const untilClose = this.hotUntil - this.now();
    this.schedule(Math.max(0, Math.min(HOT_POLL_MS, untilClose)) + this.spread(SPREAD_MS));
  }

  /** Makes sure a fetch starts within `delayMs`; an earlier one already counts. */
  private schedule(delayMs: number): void {
    if (this.disposed || this.inFlight) return;

    const due = this.now() + delayMs;
    if (this.timer !== null && this.dueAt <= due) return;

    this.cancelTimer();
    this.dueAt = due;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.dueAt = Number.POSITIVE_INFINITY;
      void this.run();
    }, delayMs);
  }

  private async run(): Promise<void> {
    if (this.disposed || this.inFlight) return;

    this.inFlight = true;
    const startedAt = this.now();
    let ok = false;
    try {
      ok = await this.fetchList();
    } catch {
      ok = false;
    }
    this.inFlight = false;
    if (this.disposed) return;

    if (ok) {
      this.failures = 0;
      this.lastSuccessStart = startedAt;
    } else {
      this.failures += 1;
    }
    // Whatever arrived while this fetch was in flight is still owed, and plan() sees it.
    this.plan(SPREAD_MS);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.dueAt = Number.POSITIVE_INFINITY;
  }

  private spread(maxMs: number): number {
    return Math.floor(this.random() * maxMs);
  }
}

/** A confirmation or drop-out is tried at most this many times before the error shows. */
export const WRITE_ATTEMPTS = 3;

/**
 * join_game and leave_game are idempotent, so retrying one can never take a second
 * slot or drop someone twice: it answers with the same position. Worth retrying:
 * the request never got an answer (status 0), the database or the gateway in front
 * of it failed (5xx, which includes PostgREST running out of connections at the
 * opening peak), and LIST_NOT_OPEN, which near the opening means this phone's
 * estimate of the database clock was a hair early.
 */
export function isRetryableWriteError(
  error: { message?: string } | null,
  status: number,
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (status === 0) return !/abort/i.test(message);
  if (status >= 500) return true;
  return message.includes("LIST_NOT_OPEN");
}

/** About 0.3s, then 0.9s, each with a little spread so retries do not line up. */
export function writeRetryDelay(attempt: number, random: () => number = Math.random): number {
  return 300 * 3 ** (attempt - 1) + Math.floor(random() * 300);
}

/** A sample older than this stops winning over newer, slower ones. */
export const MAX_CLOCK_SAMPLE_AGE_MS = 5 * 60 * 1000;

/**
 * The database clock as seen from this phone. Every response carries server_time,
 * read when the request reached the database: assuming that happened halfway
 * through the round trip removes the half-trip delay that a plain
 * `server_time - now` adds, which made the button light up late, and later on
 * slower connections. The sample with the shortest round trip wins, because it
 * leaves the least room for error, so a slow response during the opening rush
 * never drags the countdown around.
 */
export class ServerClock {
  private offset: number;
  private bestRtt = Number.POSITIVE_INFINITY;
  private bestAt = Number.NEGATIVE_INFINITY;

  /** Starts from a state whose request was not timed, such as the server render. */
  constructor(serverTimeMs: number, receivedAt: number) {
    this.offset = serverTimeMs - receivedAt;
  }

  sample(serverTimeMs: number, sentAt: number, receivedAt: number): void {
    const rtt = Math.max(0, receivedAt - sentAt);
    const stale = receivedAt - this.bestAt > MAX_CLOCK_SAMPLE_AGE_MS;
    if (rtt > this.bestRtt && !stale) return;

    this.offset = serverTimeMs - (sentAt + rtt / 2);
    this.bestRtt = rtt;
    this.bestAt = receivedAt;
  }

  /** Database time for a device timestamp. */
  at(deviceTimeMs: number): number {
    return deviceTimeMs + this.offset;
  }
}
