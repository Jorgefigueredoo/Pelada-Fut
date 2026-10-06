"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/datetime";
import { notificationMessage } from "@/lib/notifications";
import { useNotifications } from "@/lib/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { items, unreadCount, loading, markAllRead } = useNotifications();

  return (
    <DropdownMenu onOpenChange={(open) => open && markAllRead()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"
          }
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-w-[90vw]">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              Carregando...
            </p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              Nenhuma novidade por aqui.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {items.map((notification) => {
                const content = (
                  <div className="flex items-start gap-2 px-2 py-2.5">
                    {!notification.read_at && (
                      <span
                        className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                        aria-hidden
                      />
                    )}
                    <div className={cn("min-w-0 flex-1", notification.read_at && "pl-4")}>
                      <p className="text-sm leading-snug">
                        {notificationMessage(notification)}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {formatRelative(notification.created_at)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <li key={notification.id}>
                    {notification.game ? (
                      <Link href="/" className="hover:bg-accent block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
