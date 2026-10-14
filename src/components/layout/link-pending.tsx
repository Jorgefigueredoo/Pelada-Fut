"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

/**
 * Lights up the tab that was just tapped while its page is on the way, so a slow
 * connection never looks like a tap that did nothing. Always rendered, only its
 * opacity changes, so nothing shifts. Must sit inside a relative <Link>.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary/15 pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-150",
        pending && "animate-pulse opacity-100",
        className,
      )}
    />
  );
}
