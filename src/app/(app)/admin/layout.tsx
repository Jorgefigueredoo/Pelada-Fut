import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminProfile();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Admin
        </p>
        <AdminNav />
      </header>
      {children}
    </div>
  );
}
