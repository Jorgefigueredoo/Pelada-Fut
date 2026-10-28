import { PlayerActions } from "@/components/admin/player-actions";
import { Avatar, AvatarFallback, AvatarLazyImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { avatarUrl } from "@/lib/avatar";
import type { AdminPlayer, UserStatus } from "@/lib/types";

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  blocked: "Inativo",
};

const STATUS_VARIANT: Record<UserStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "outline",
  rejected: "destructive",
  blocked: "destructive",
};

export function PlayerCard({
  player,
  currentUserId,
}: {
  player: AdminPlayer;
  currentUserId: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="shrink-0">
              <AvatarLazyImage src={avatarUrl(player.avatar_path, player.avatar_updated_at)} />
              <AvatarFallback>{player.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{player.nickname}</p>
              <p className="text-muted-foreground truncate text-sm">{player.full_name}</p>
              <p className="text-muted-foreground truncate text-xs">{player.email}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={STATUS_VARIANT[player.status]}>
              {STATUS_LABEL[player.status]}
            </Badge>
            {player.role === "admin" && <Badge>Admin</Badge>}
          </div>
        </div>

        <PlayerActions player={player} isSelf={player.id === currentUserId} />
      </CardContent>
    </Card>
  );
}
