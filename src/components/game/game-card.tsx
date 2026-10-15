"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CalendarPlus,
  CalendarX2,
  Loader2,
  MapPin,
  PartyPopper,
  RefreshCw,
  Trophy,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Confetti } from "@/components/game/confetti";
import { SignupList } from "@/components/game/signup-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCountdown, formatGameDateTime } from "@/lib/datetime";
import { friendlyError } from "@/lib/errors";
import { isRetryableWriteError, WRITE_ATTEMPTS, writeRetryDelay } from "@/lib/list-sync";
import { createClient } from "@/lib/supabase/client";
import type { GameState } from "@/lib/types";
import { useGameState } from "@/lib/use-game-state";
import { cn } from "@/lib/utils";

export function GameCard({
  initialState,
  currentUserId,
}: {
  initialState: GameState;
  currentUserId: string;
}) {
  const { state, serverNow, live, refreshing, refetch, applyState } =
    useGameState(initialState);
  const [busy, setBusy] = useState<"join" | "leave" | null>(null);
  const [error, setError] = useState<string>();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    };
  }, []);

  const game = state.game;
  const mine = state.my_signup;

  if (!game) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="Nenhuma pelada marcada"
        description="Quando um admin marcar a próxima pelada, ela aparece aqui."
      />
    );
  }

  /**
   * The screen only says "confirmado" after the server says so. No optimistic update.
   * A dropped connection or an overloaded moment at the opening is retried quietly
   * (both functions are idempotent) before the player ever sees an error.
   */
  async function call(action: "join_game" | "leave_game") {
    setBusy(action === "join_game" ? "join" : "leave");
    setError(undefined);

    const supabase = createClient();
    for (let attempt = 1; ; attempt += 1) {
      const sentAt = Date.now();
      const { data, error: rpcError, status } = await supabase.rpc(action, {
        p_game_id: game!.id,
      });
      const receivedAt = Date.now();

      if (!rpcError && data) {
        const next = data as GameState;
        applyState(next, { sentAt, receivedAt });
        if (action === "join_game" && next.my_signup?.status === "confirmed") {
          setCelebrating(true);
          if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
          celebrateTimer.current = setTimeout(() => setCelebrating(false), 2400);
        }
        break;
      }
      if (attempt < WRITE_ATTEMPTS && isRetryableWriteError(rpcError, status)) {
        await new Promise((resolve) => setTimeout(resolve, writeRetryDelay(attempt)));
        continue;
      }
      setError(friendlyError(rpcError));
      break;
    }

    setBusy(null);
    setConfirmingLeave(false);
  }

  const msUntilOpen = new Date(game.list_opens_at).getTime() - serverNow;
  const msUntilStart = new Date(game.starts_at).getTime() - serverNow;
  const canceled = game.status === "canceled";
  const started = msUntilStart <= 0;
  const beforeOpening = msUntilOpen > 0;
  const waitlistPosition = mine ? Math.max(1, mine.position - game.slots) : 0;
  const confirmedCount = state.entries.filter((entry) => entry.status === "confirmed").length;
  const fillPercent = Math.min(100, Math.round((confirmedCount / game.slots) * 100));

  return (
    <div className="space-y-5">
      <Card className="relative py-0">
        {celebrating && <Confetti />}

        <div className="bg-pitch-stripes space-y-1.5 px-4 py-5 text-white">
          <p className="text-xl leading-tight font-semibold">
            {formatGameDateTime(game.starts_at)}
          </p>
          {game.location && (
            <p className="flex items-center gap-1.5 text-sm text-white/80">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {game.location}
            </p>
          )}
          <p className="text-sm text-white/80">{game.slots} vagas</p>
        </div>

        <CardContent className="space-y-4 pt-1 pb-4">
          {!canceled && (
            <div className="space-y-1.5">
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>
                  {confirmedCount} de {game.slots} confirmados
                </span>
                <span className="tabular-nums">{fillPercent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Vagas preenchidas"
                aria-valuemin={0}
                aria-valuemax={game.slots}
                aria-valuenow={Math.min(confirmedCount, game.slots)}
                className="bg-muted h-2.5 overflow-hidden rounded-full"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    fillPercent >= 100 ? "bg-gold" : "bg-primary",
                  )}
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
            </div>
          )}

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
                <Alert className="animate-pop">
                  <ArrowUp />
                  <AlertTitle>Você subiu da lista de espera</AlertTitle>
                  <AlertDescription>
                    Está confirmado, nº {mine.position}. Boa pelada.
                  </AlertDescription>
                </Alert>
              )}

              {mine?.demoted_at && mine.status === "waitlist" && (
                <Alert variant="destructive" className="animate-pop">
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
                <Alert variant="destructive" role="alert" className="animate-pop">
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
                  className={cn(
                    "h-14 w-full rounded-2xl text-base font-semibold",
                    !beforeOpening && busy === null && "animate-pulse-ring",
                  )}
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
                  className="h-12 w-full rounded-2xl"
                  onClick={() => setConfirmingLeave(true)}
                >
                  Desistir
                </Button>
              )}

              {!started && mine && confirmingLeave && (
                <div className="animate-pop space-y-2">
                  <p className="text-muted-foreground text-sm">
                    {mine.status === "confirmed"
                      ? "Sua vaga vai para o primeiro da lista de espera. Tem certeza?"
                      : "Você sai da fila. Se voltar, entra no fim dela. Tem certeza?"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="h-12 flex-1 rounded-2xl"
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
                      className="h-12 flex-1 rounded-2xl"
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
        <Badge variant={live ? "secondary" : "outline"} className="h-6 gap-2 px-2.5">
          <span className="relative flex size-2" aria-hidden>
            {live && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                live ? "bg-emerald-500" : "bg-muted-foreground",
              )}
            />
          </span>
          {live ? "Ao vivo" : "Atualizando a cada 5s"}
        </Badge>
        <Button variant="ghost" size="sm" onClick={refetch} disabled={refreshing}>
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
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

/** Days, hours, minutes and seconds of a duration, for the boxes of the countdown. */
function countdownParts(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return [
    { value: Math.floor(total / 86_400), label: "dias" },
    { value: Math.floor((total % 86_400) / 3600), label: "horas" },
    { value: Math.floor((total % 3600) / 60), label: "min" },
    { value: total % 60, label: "seg" },
  ];
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
    const parts = countdownParts(msUntilOpen).filter(
      (part, index) => index > 0 || part.value > 0,
    );

    return (
      <div className="bg-muted rounded-2xl p-4 text-center">
        <p className="text-muted-foreground text-sm">Lista abre em</p>
        <p className="sr-only">{formatCountdown(msUntilOpen)}</p>
        <div className="mt-2 flex justify-center gap-2" aria-hidden>
          {parts.map((part) => (
            <div
              key={part.label}
              className="bg-card ring-foreground/8 min-w-14 rounded-xl px-2 py-2 shadow-sm ring-1"
            >
              <p className="font-mono text-2xl leading-none font-semibold tabular-nums">
                {String(part.value).padStart(2, "0")}
              </p>
              <p className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">
                {part.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mine?.status === "confirmed") {
    return (
      <div className="animate-pop flex items-center justify-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-center ring-1 ring-emerald-500/20">
        <Trophy className="text-gold size-6 shrink-0" aria-hidden />
        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
          Você está confirmado, nº {mine.position}
        </p>
      </div>
    );
  }

  if (mine?.status === "waitlist") {
    return (
      <div className="animate-pop rounded-2xl bg-amber-500/10 p-4 text-center ring-1 ring-amber-500/20">
        <p className="text-lg font-semibold text-amber-700 dark:text-amber-500">
          Lista de espera, {waitlistPosition}º da fila
        </p>
      </div>
    );
  }

  if (started) return null;

  return (
    <div className="bg-primary/10 flex items-center justify-center gap-2 rounded-2xl p-4 text-center">
      <PartyPopper className="text-primary size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Lista aberta</p>
        <p className="text-muted-foreground text-sm">Confirme sua presença abaixo.</p>
      </div>
    </div>
  );
}
