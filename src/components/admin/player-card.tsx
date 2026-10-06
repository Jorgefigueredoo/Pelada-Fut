import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerActions } from "@/components/admin/player-actions";
import type { AdminPlayer, UserStatus } from "@/lib/types";

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  blocked: "Bloqueado",
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
          <div className="min-w-0">
            <p className="truncate font-medium">{player.nickname}</p>
            <p className="text-muted-foreground truncate text-sm">{player.full_name}</p>
            <p className="text-muted-foreground truncate text-xs">{player.email}</p>
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
