import { requireApprovedProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

export default async function HomePage() {
  const profile = await requireApprovedProfile();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-muted-foreground text-sm">Olá, {profile.nickname}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      </header>

      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">Nenhuma pelada marcada</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Quando um admin marcar a próxima pelada, ela aparece aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
