"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ListSync, ServerClock } from "@/lib/list-sync";
import { createClient } from "@/lib/supabase/client";
import type { GameState, GameStateUnchanged, ListChangedPayload } from "@/lib/types";

/** Used only while the realtime channel is not connected. */
const FALLBACK_POLL_MS = 5000;
/** Even with the channel up, check this often in case a broadcast was lost. */
const SAFETY_POLL_MS = 30_000;
/** Coming back to the app refetches, unless the list was fetched this recently. */
const REFOCUS_MIN_AGE_MS = 2000;

/** When a request left and when its response arrived, so the clock can discount the trip. */
export type ResponseTiming = { sentAt: number; receivedAt: number };

type UseGameState = {
  state: GameState;
  /** Estimated database time in milliseconds. Never the device clock. */
  serverNow: number;
  live: boolean;
  /** True from a tap on Atualizar until the fetch it started comes back. */
  refreshing: boolean;
  refetch: () => void;
  applyState: (next: GameState | GameStateUnchanged, timing: ResponseTiming) => void;
};

/**
 * Keeps one pelada's list fresh without hammering the Free plan at the opening:
 *   - Realtime Broadcast from the database on a private channel per pelada, which
 *     authorizes once at subscribe time instead of per event per subscriber.
 *   - What to fetch and when is decided by ListSync (src/lib/list-sync.ts):
 *     broadcasts are coalesced by the database, fetches are spread out, and a fetch
 *     that finds nothing new costs a few bytes.
 *   - Refetch when the app comes back to the foreground.
 *   - If the channel is down, poll every 5s while the screen is visible, so the app
 *     keeps working rather than showing a frozen list.
 *
 * Nothing refetches at the moment the countdown ends: the button enables from the
 * database clock, the database refuses an early tap, and the first confirmation's
 * broadcast wakes everyone up. A hundred phones asking "is it open?" in the same
 * second as a hundred confirmations was pure load.
 */
export function useGameState(initialState: GameState): UseGameState {
  const [state, setState] = useState(initialState);
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The countdown runs off this, which is the database clock carried in every
  // response, plus the time elapsed on the device since.
  const [serverNow, setServerNow] = useState(() =>
    new Date(initialState.server_time).getTime(),
  );

  const gameId = state.game?.id ?? null;

  const versionRef = useRef<number | null>(initialState.version ?? null);
  const clockRef = useRef<ServerClock | null>(null);
  const syncRef = useRef<ListSync | null>(null);
  const liveRef = useRef(false);

  useEffect(() => {
    // Seeded once from the server render; every timed response refines it.
    clockRef.current ??= new ServerClock(
      new Date(initialState.server_time).getTime(),
      Date.now(),
    );
  }, [initialState.server_time]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (clockRef.current) setServerNow(clockRef.current.at(Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const applyState = useCallback(
    (next: GameState | GameStateUnchanged, timing: ResponseTiming) => {
      const clock = clockRef.current;
      if (clock) {
        clock.sample(new Date(next.server_time).getTime(), timing.sentAt, timing.receivedAt);
        setServerNow(clock.at(Date.now()));
      }

      if ("unchanged" in next) return;
      // A response that left before a newer one but arrived after it: the screen
      // keeps the newer. Without this, a refetch that crossed a confirmation could
      // flip "Você está confirmado" back to "Confirmar presença" for a second.
      if (versionRef.current !== null && next.version < versionRef.current) return;

      versionRef.current = next.version ?? null;
      setState(next);
    },
    [],
  );

  useEffect(() => {
    if (!gameId) return;

    const supabase = createClient();
    const sync = new ListSync({
      currentVersion: () => versionRef.current,
      fetch: () => load().finally(() => setRefreshing(false)),
    });

    async function load(): Promise<boolean> {
      const sentAt = Date.now();
      const { data, error } = await supabase.rpc("get_game_state", {
        p_game_id: gameId,
        p_known_version: versionRef.current ?? undefined,
      });
      if (error) return false;
      if (data === null) {
        // The pelada was deleted while this screen was open: show the empty state
        // instead of retrying a list that no longer exists.
        setState((current) => ({ ...current, game: null, entries: [], my_signup: null }));
        return true;
      }
      applyState(data as GameState | GameStateUnchanged, { sentAt, receivedAt: Date.now() });
      return true;
    }
    syncRef.current = sync;

    // Realtime: one private channel per pelada.
    let active = true;
    const channel = supabase.channel(`game:${gameId}`, { config: { private: true } });

    void (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;

      channel
        .on("broadcast", { event: "list_changed" }, ({ payload }) => {
          const { version, quiet_ms } = (payload ?? {}) as ListChangedPayload;
          sync.onBroadcast(version, quiet_ms);
        })
        .subscribe((status) => {
          if (!active) return;
          const isLive = status === "SUBSCRIBED";
          liveRef.current = isLive;
          setLive(isLive);
          if (isLive) sync.onSubscribed();
        });
    })();

    // Polls only while someone is looking: every 5s while the channel is down, and
    // every 30s while it is up, as a safety net for a lost broadcast. Both send the
    // version on screen, so they cost a few bytes when nothing changed.
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!liveRef.current || sync.msSinceLastSuccess() >= SAFETY_POLL_MS) sync.poll();
    }, FALLBACK_POLL_MS);

    // Coming back to the app always shows a fresh list.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync.refreshIfOlderThan(REFOCUS_MIN_AGE_MS);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      active = false;
      sync.dispose();
      syncRef.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      liveRef.current = false;
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [gameId, applyState]);

  const refetch = useCallback(() => {
    if (!syncRef.current) return;
    setRefreshing(true);
    syncRef.current.refresh();
  }, []);

  return { state, serverNow, live, refreshing, refetch, applyState };
}
