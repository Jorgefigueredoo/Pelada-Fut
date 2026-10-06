import { MainNav } from "@/components/layout/main-nav";
import { requireApprovedProfile } from "@/lib/auth";

// Authenticated output is never prerendered or cached, at any layer.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireApprovedProfile();

  return (
    <div className="min-h-dvh pb-16">
      <div className="mx-auto w-full max-w-md px-4 py-6">{children}</div>
      <MainNav isAdmin={profile.role === "admin"} />
    </div>
  );
}
