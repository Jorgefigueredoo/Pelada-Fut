"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { GameState } from "@/lib/types";

/** No client refetches more than once a second, even at the opening peak. */
const REFETCH_INTERVAL_MS = 1000;
/** Used only while the realtime channel is not connected. */
const FALLBACK_POLL_MS = 5000;

type UseGameState = {
  state: GameState;
  /** Estimated database time in milliseconds. Never the device clock. */
  serverNow: number;
  live: boolean;
  refetch: () => void;
  applyState: (next: GameState) => void;
};

/**
 * Keeps one pelada's list fresh:
 *   - Realtime Broadcast from the database on a private channel per pelada, which
 *     authorizes once at subscribe time instead of per event per subscriber.
 *   - On an event, refetch the list at most once a second.
 *   - Refetch when the app comes back to the foreground.
 *   - If the channel never connects, poll every 5s while the screen is visible, so
 *     the app keeps working rather than showing a frozen list.
 */
export function useGameState(initialState: GameState): UseGameState {
  const [state, setState] = useState(initialState);
  const [live, setLive] = useState(false);
  // The countdown runs off this, which is the database clock carried in every
  // response, plus the time elapsed on the device since that response arrived.
  const [serverNow, setServerNow] = useState(() =>
    new Date(initialState.server_time).getTime(),
  );

  const gameId = state.game?.id ?? null;

  /** Difference between the database clock and this device's clock. */
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = new Date(initialState.server_time).getTime() - Date.now();
  }, [initialState.server_time]);

  const applyState = useCallback((next: GameState) => {
    const serverTime = new Date(next.server_time).getTime();
    offsetRef.current = serverTime - Date.now();
    setServerNow(serverTime);
    setState(next);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setServerNow(Date.now() + offsetRef.current), 1000);
    return () => clearInterval(timer);
  }, []);

  const lastFetchRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const fetchNow = useCallback(async () => {
    if (!gameId || inFlightRef.current) return;

    inFlightRef.current = true;
    lastFetchRef.current = Date.now();
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_game_state", { p_game_id: gameId });
      if (!error && data) applyState(data as GameState);
    } finally {
      inFlightRef.current = false;
    }
  }, [gameId, applyState]);

  /** Leading call, then a single trailing call, so a burst of events costs one request. */
  const refetch = useCallback(() => {
    const since = Date.now() - lastFetchRef.current;
    if (since >= REFETCH_INTERVAL_MS) {
      void fetchNow();
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      void fetchNow();
    }, REFETCH_INTERVAL_MS - since);
  }, [fetchNow]);

  useEffect(() => {
    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, []);

  // Realtime: one private channel per pelada.
  useEffect(() => {
    if (!gameId) return;

    const supabase = createClient();
    let active = true;
    const channel = supabase.channel(`game:${gameId}`, { config: { private: true } });

    void (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;

      channel
        .on("broadcast", { event: "list_changed" }, () => refetch())
        .subscribe((status) => {
          if (!active) return;
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") refetch();
        });
    })();

    return () => {
      active = false;
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [gameId, refetch]);

  // Fallback polling while the channel is down and the screen is in front of someone.
  useEffect(() => {
    if (!gameId || live) return;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, FALLBACK_POLL_MS);

    return () => clearInterval(timer);
  }, [gameId, live, refetch]);

  // Coming back to the app always shows a fresh list.
  useEffect(() => {
    if (!gameId) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [gameId, refetch]);

  // The moment the countdown reaches zero, ask the server instead of trusting it.
  const openedRef = useRef(false);

  useEffect(() => {
    openedRef.current = false;
  }, [gameId]);

  useEffect(() => {
    const game = state.game;
    if (!game || game.is_open || game.status === "canceled") return;
    if (openedRef.current) return;

    if (serverNow >= new Date(game.list_opens_at).getTime()) {
      openedRef.current = true;
      refetch();
    }
  }, [serverNow, state.game, refetch]);

  return { state, serverNow, live, refetch, applyState };
}
