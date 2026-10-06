"use client";

import { useState } from "react";
import { ArrowUp, CalendarX2, Loader2, MapPin, RefreshCw } from "lucide-react";

import { SignupList } from "@/components/game/signup-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCountdown, formatGameDateTime } from "@/lib/datetime";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { GameState } from "@/lib/types";
import { useGameState } from "@/lib/use-game-state";

export function GameCard({
  initialState,
  currentUserId,
}: {
  initialState: GameState;
  currentUserId: string;
}) {
  const { state, serverNow, live, refetch, applyState } = useGameState(initialState);
  const [busy, setBusy] = useState<"join" | "leave" | null>(null);
  const [error, setError] = useState<string>();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const game = state.game;
  const mine = state.my_signup;

  if (!game) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">Nenhuma pelada marcada</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Quando um admin marcar a próxima pelada, ela aparece aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  /** The screen only says "confirmado" after the server says so. No optimistic update. */
  async function call(action: "join_game" | "leave_game") {
    setBusy(action === "join_game" ? "join" : "leave");
    setError(undefined);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(action, { p_game_id: game!.id });

    if (rpcError) setError(friendlyError(rpcError));
    else if (data) applyState(data as GameState);

    setBusy(null);
    setConfirmingLeave(false);
  }

  const msUntilOpen = new Date(game.list_opens_at).getTime() - serverNow;
  const msUntilStart = new Date(game.starts_at).getTime() - serverNow;
  const canceled = game.status === "canceled";
  const started = msUntilStart <= 0;
  const beforeOpening = msUntilOpen > 0;
  const waitlistPosition = mine ? Math.max(1, mine.position - game.slots) : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-lg leading-tight font-semibold">
              {formatGameDateTime(game.starts_at)}
            </p>
            {game.location && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {game.location}
              </p>
            )}
            <p className="text-muted-foreground text-sm">{game.slots} vagas</p>
          </div>

          {canceled ? (
            <Alert variant="destructive">
              <CalendarX2 />
              <AlertTitle>Pelada cancelada</AlertTitle>
              <AlertDescription>
                Esta pelada foi cancelada por um admin. Fique de olho no grupo.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {mine?.promoted_at && mine.status === "confirmed" && (
                <Alert>
                  <ArrowUp />
                  <AlertTitle>Você subiu da lista de espera</AlertTitle>
                  <AlertDescription>
                    Está confirmado, nº {mine.position}. Boa pelada.
                  </AlertDescription>
                </Alert>
              )}

              {mine?.demoted_at && mine.status === "waitlist" && (
                <Alert variant="destructive">
                  <AlertTitle>Você voltou para a lista de espera</AlertTitle>
                  <AlertDescription>
                    O número de vagas mudou. Você é o {waitlistPosition}º da fila.
                  </AlertDescription>
                </Alert>
              )}

              <StatusBlock
                beforeOpening={beforeOpening}
                msUntilOpen={msUntilOpen}
                started={started}
                mine={mine}
                waitlistPosition={waitlistPosition}
              />

              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription className="space-y-2">
                    <span className="block">{error}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => call(mine ? "leave_game" : "join_game")}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      Tentar de novo
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {!started && !mine && (
                <Button
                  size="lg"
                  className="h-14 w-full text-base"
                  disabled={beforeOpening || busy !== null}
                  onClick={() => call("join_game")}
                >
                  {busy === "join" ? (
                    <>
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      Confirmando...
                    </>
                  ) : beforeOpening ? (
                    "A lista ainda não abriu"
                  ) : (
                    "Confirmar presença"
                  )}
                </Button>
              )}

              {!started && mine && !confirmingLeave && (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full"
                  onClick={() => setConfirmingLeave(true)}
                >
                  Desistir
                </Button>
              )}

              {!started && mine && confirmingLeave && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    {mine.status === "confirmed"
                      ? "Sua vaga vai para o primeiro da lista de espera. Tem certeza?"
                      : "Você sai da fila. Se voltar, entra no fim dela. Tem certeza?"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="h-12 flex-1"
                      disabled={busy !== null}
                      onClick={() => call("leave_game")}
                    >
                      {busy === "leave" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Saindo...
                        </>
                      ) : (
                        "Sim, desistir"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-12 flex-1"
                      onClick={() => setConfirmingLeave(false)}
                    >
                      Não
                    </Button>
                  </div>
                </div>
              )}

              {started && (
                <p className="text-muted-foreground text-sm">
                  A pelada já começou. Daqui para frente só um admin altera a lista.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Badge variant={live ? "secondary" : "outline"} className="gap-1.5">
          <span
            className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground"}`}
            aria-hidden
          />
          {live ? "Ao vivo" : "Atualizando a cada 5s"}
        </Badge>
        <Button variant="ghost" size="sm" onClick={refetch}>
          <RefreshCw className="size-4" aria-hidden />
          Atualizar
        </Button>
      </div>

      <SignupList
        entries={state.entries}
        currentUserId={currentUserId}
        slots={game.slots}
      />
    </div>
  );
}

/** The one line that has to be understandable in a second. */
function StatusBlock({
  beforeOpening,
  msUntilOpen,
  started,
  mine,
  waitlistPosition,
}: {
  beforeOpening: boolean;
  msUntilOpen: number;
  started: boolean;
  mine: GameState["my_signup"];
  waitlistPosition: number;
}) {
  if (beforeOpening) {
    return (
      <div className="bg-muted rounded-lg p-4 text-center">
        <p className="text-muted-foreground text-sm">Lista abre em</p>
        <p className="font-mono text-3xl font-semibold tabular-nums">
          {formatCountdown(msUntilOpen)}
        </p>
      </div>
    );
  }

  if (mine?.status === "confirmed") {
    return (
      <div className="rounded-lg bg-emerald-500/10 p-4 text-center">
        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
          Você está confirmado, nº {mine.position}
        </p>
      </div>
    );
  }

  if (mine?.status === "waitlist") {
    return (
      <div className="rounded-lg bg-amber-500/10 p-4 text-center">
        <p className="text-lg font-semibold text-amber-700 dark:text-amber-500">
          Lista de espera, {waitlistPosition}º da fila
        </p>
      </div>
    );
  }

  if (started) return null;

  return (
    <div className="bg-muted rounded-lg p-4 text-center">
      <p className="font-medium">Lista aberta</p>
      <p className="text-muted-foreground text-sm">Confirme sua presença abaixo.</p>
    </div>
  );
}
