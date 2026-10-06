import { formatGameDateTime } from "@/lib/datetime";
import type { AppNotification } from "@/lib/types";

/** Turns a stable notification type (+ its game, when there is one) into a sentence. */
export function notificationMessage(notification: AppNotification): string {
  const when = notification.game ? formatGameDateTime(notification.game.starts_at) : null;
  const position = notification.meta.position;

  switch (notification.type) {
    case "approved":
      return "Sua conta foi aprovada. Você já pode confirmar presença.";
    case "promoted":
      return when
        ? `Você subiu da lista de espera na pelada de ${when}${
            typeof position === "number" ? `, agora nº ${position}` : ""
          }.`
        : "Você subiu da lista de espera.";
    case "demoted":
      return when
        ? `Você foi para a lista de espera na pelada de ${when}.`
        : "Você foi para a lista de espera.";
    case "admin_added":
      return when
        ? `Um admin confirmou sua presença na pelada de ${when}.`
        : "Um admin confirmou sua presença numa pelada.";
    case "admin_removed":
      return when
        ? `Um admin tirou você da lista da pelada de ${when}.`
        : "Um admin tirou você de uma lista.";
    case "game_canceled":
      return when ? `A pelada de ${when} foi cancelada.` : "Uma pelada foi cancelada.";
    case "game_reopened":
      return when ? `A pelada de ${when} foi reaberta.` : "Uma pelada foi reaberta.";
    case "team_published":
      return when ? `Os times da pelada de ${when} foram publicados.` : "Os times foram publicados.";
    default:
      return "Você tem uma novidade na pelada.";
  }
}
