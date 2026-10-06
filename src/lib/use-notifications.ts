"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/types";

/**
 * No push, no realtime channel: a modest poll while the tab is visible is enough for
 * something this low-urgency, and it costs nothing extra on the Supabase Free plan.
 */
const POLL_MS = 30_000;

type UseNotifications = {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refetch: () => void;
  markAllRead: () => void;
};

export function useNotifications(): UseNotifications {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_notifications");
      if (!error && data) {
        setItems(data.items as AppNotification[]);
        setUnreadCount(data.unread_count as number);
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchNotifications();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchNotifications]);

  const markAllRead = useCallback(() => {
    if (unreadCount === 0) return;
    // Optimistic: opening the bell is the "I've seen these" signal, no need to wait.
    setUnreadCount(0);
    setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    void createClient().rpc("mark_all_notifications_read");
  }, [unreadCount]);

  return { items, unreadCount, loading, refetch: fetchNotifications, markAllRead };
}
