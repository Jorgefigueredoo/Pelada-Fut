"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Users } from "lucide-react";

import { LinkPending } from "@/components/layout/link-pending";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/peladas", label: "Peladas", icon: CalendarDays },
  { href: "/admin/jogadores", label: "Jogadores", icon: Users },
];

/** Big, clearly-active tabs: this is the hub the admin lives in, not a footnote. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-muted grid grid-cols-2 gap-1 rounded-2xl p-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground ring-foreground/8 shadow-sm ring-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
