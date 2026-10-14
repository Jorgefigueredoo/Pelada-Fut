import { Goal, LogOut } from "lucide-react";

import { NotificationBell } from "@/components/layout/notification-bell";
import { Button } from "@/components/ui/button";
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

        <div className="flex items-center gap-1">
          <NotificationBell />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
              <LogOut className="size-5" aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
