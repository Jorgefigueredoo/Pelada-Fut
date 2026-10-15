import type { Metadata } from "next";
import { Palette, ShieldCheck, UserRound } from "lucide-react";

import { AvatarForm } from "@/components/profile/avatar-form";
import { PasswordForm } from "@/components/profile/password-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { SubmitButton } from "@/components/submit-button";
import { AppearancePicker } from "@/components/theme/appearance-picker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/actions/auth";
import { requireApprovedProfile } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const profile = await requireApprovedProfile();
  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>

      {/* The player card: who you are on the list, at a glance. */}
      <Card className="animate-in fade-in-0 zoom-in-95 py-0 duration-500">
        <div className="bg-pitch-stripes h-20" aria-hidden />
        <CardContent className="-mt-10 flex flex-col items-center gap-2 pb-5 text-center">
          <Avatar className="ring-card size-20 ring-4 shadow-lg">
            <AvatarImage
              src={avatarUrl(profile.avatar_path, profile.avatar_updated_at) ?? undefined}
              alt=""
            />
            <AvatarFallback className="bg-pitch-stripes text-gold text-2xl font-semibold">
              {profile.nickname.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xl font-semibold">{profile.nickname}</p>
            <p className="text-muted-foreground text-sm">{profile.full_name}</p>
          </div>
          <span
            className={
              isAdmin
                ? "bg-gold/20 text-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                : "bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
            }
          >
            {isAdmin ? (
              <ShieldCheck className="size-3.5" aria-hidden />
            ) : (
              <UserRound className="size-3.5" aria-hidden />
            )}
            {isAdmin ? "Admin" : "Jogador"}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <AvatarForm profile={profile} />
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="text-primary size-4" aria-hidden />
            Aparência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AppearancePicker />
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
