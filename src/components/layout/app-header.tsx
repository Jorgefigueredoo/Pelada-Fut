import { LogOut } from "lucide-react";

import { NotificationBell } from "@/components/layout/notification-bell";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { APP_NAME } from "@/lib/constants";

/** On every authenticated page, so sign out and notifications are always one tap away. */
export function AppHeader() {
  return (
    <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <span className="truncate font-semibold tracking-tight">{APP_NAME}</span>

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
