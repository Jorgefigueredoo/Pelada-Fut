import type { Metadata } from "next";

import { PasswordForm } from "@/components/profile/password-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/actions/auth";
import { requireApprovedProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const profile = await requireApprovedProfile();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <form action={signOutAction}>
        <SubmitButton variant="ghost" pendingLabel="Saindo...">
          Sair da conta
        </SubmitButton>
      </form>
    </div>
  );
}
