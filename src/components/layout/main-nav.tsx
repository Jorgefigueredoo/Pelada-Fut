"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Shield, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const PLAYER_LINKS = [
  { href: "/", label: "Início", icon: CalendarDays },
  { href: "/times", label: "Times", icon: Users },
  { href: "/perfil", label: "Perfil", icon: User },
];

const ADMIN_LINK = { href: "/admin/jogadores", label: "Admin", icon: Shield };

/** Bottom bar, because the app is used standing up, on a phone, with one hand. */
export function MainNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...PLAYER_LINKS, ADMIN_LINK] : PLAYER_LINKS;

  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
