import { Goal } from "lucide-react";

import { NotificationBell } from "@/components/layout/notification-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { signOutAction } from "@/lib/actions/auth";
import { APP_NAME } from "@/lib/constants";

/** On every authenticated page, so sign out and notifications are always one tap away. */
export function AppHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur-lg">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <span className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight">
          <span className="bg-pitch-stripes text-gold grid size-8 shrink-0 place-items-center rounded-xl shadow-sm">
            <Goal className="size-4.5" aria-hidden />
          </span>
          <span className="truncate">{APP_NAME}</span>
        </span>

        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <NotificationBell />
          <form action={signOutAction}>
            <SignOutButton />
          </form>
        </div>
      </div>
    </header>
  );
}
