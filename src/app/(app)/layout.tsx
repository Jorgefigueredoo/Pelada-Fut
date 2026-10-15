import { AppHeader } from "@/components/layout/app-header";
import { MainNav } from "@/components/layout/main-nav";
import { requireApprovedProfile } from "@/lib/auth";

// Authenticated output is never prerendered or cached, at any layer.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireApprovedProfile();

  return (
    <div className="relative isolate min-h-dvh pb-28">
      {/* A soft glow of pitch green behind the top of every page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]"
      />
      <AppHeader />
      <div className="mx-auto w-full max-w-md px-4 py-6">{children}</div>
      <MainNav isAdmin={profile.role === "admin"} />
    </div>
  );
}
