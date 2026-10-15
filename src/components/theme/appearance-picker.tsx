"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { THEME_OPTIONS } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** Three big buttons on the Perfil page: the same choice as the header, easier to find. */
export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  // The chosen theme only exists in the browser; until hydrated, nothing is marked.
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const current = hydrated ? (theme ?? "system") : null;

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl text-sm font-medium ring-1 transition-all duration-200 active:scale-95",
              selected
                ? "bg-primary text-primary-foreground ring-primary shadow-sm shadow-primary/30"
                : "bg-muted text-muted-foreground ring-transparent hover:text-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
