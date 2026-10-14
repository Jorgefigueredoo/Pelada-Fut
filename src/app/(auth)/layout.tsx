import { Goal } from "lucide-react";

import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <header className="animate-in fade-in-0 slide-in-from-top-2 space-y-3 text-center duration-500">
          <div className="bg-pitch-stripes text-gold mx-auto grid size-16 place-items-center rounded-3xl shadow-lg shadow-primary/30">
            <Goal className="size-8" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
            <p className="text-muted-foreground text-sm">Lista de presença da pelada</p>
          </div>
        </header>
        <div className="animate-in fade-in-0 slide-in-from-bottom-3 duration-500">{children}</div>
      </div>
    </main>
  );
}
