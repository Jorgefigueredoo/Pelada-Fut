import Link from "next/link";

import { requireAdminProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminProfile();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/peladas" className="font-medium underline">
            Peladas
          </Link>
          <Link href="/admin/jogadores" className="font-medium underline">
            Jogadores
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
