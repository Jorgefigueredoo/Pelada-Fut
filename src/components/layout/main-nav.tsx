"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Shield, User, Users } from "lucide-react";

import { LinkPending } from "@/components/layout/link-pending";
import { cn } from "@/lib/utils";

const PLAYER_LINKS = [
  { href: "/", label: "Início", icon: CalendarDays },
  { href: "/times", label: "Times", icon: Users },
  { href: "/perfil", label: "Perfil", icon: User },
];

const ADMIN_LINK = { href: "/admin/peladas", label: "Admin", icon: Shield };

/** Floating bar at the bottom, because the app is used standing up, with one hand. */
export function MainNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...PLAYER_LINKS, ADMIN_LINK] : PLAYER_LINKS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ul className="bg-card/90 mx-auto flex max-w-md gap-1 rounded-2xl p-1.5 shadow-lg shadow-foreground/10 ring-1 ring-foreground/10 backdrop-blur-lg">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-all duration-200 active:scale-95",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-5 transition-transform duration-200", active && "scale-110")}
                  aria-hidden
                />
                {label}
                <LinkPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
