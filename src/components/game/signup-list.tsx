import { memo } from "react";
import { ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { avatarUrl } from "@/lib/avatar";
import { formatTimeWithSeconds } from "@/lib/datetime";
import { duplicatedNicknames, entryLabel, type ListEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The transparency that ends the argument: position, nickname and the confirmation
 * time down to the second, the same for everyone.
 *
 * Memoized because the card above it re-renders every second for the countdown, and
 * a hundred rows with photos have no reason to follow along.
 */
export const SignupList = memo(function SignupList({
  entries,
  currentUserId,
  slots,
}: {
  entries: ListEntry[];
  currentUserId: string;
  slots: number;
}) {
  const duplicates = duplicatedNicknames(entries);
  const confirmed = entries.filter((entry) => entry.status === "confirmed");
  const waitlist = entries.filter((entry) => entry.status === "waitlist");

  return (
    <div className="space-y-6">
      <Section
        title="Confirmados"
        count={`${confirmed.length}/${slots}`}
        entries={confirmed}
        duplicates={duplicates}
        currentUserId={currentUserId}
        emptyLabel="Ninguém confirmado ainda."
      />

      {waitlist.length > 0 && (
        <Section
          title="Lista de espera"
          count={String(waitlist.length)}
          entries={waitlist}
          duplicates={duplicates}
          currentUserId={currentUserId}
          startAt={1}
          emptyLabel=""
        />
      )}
    </div>
  );
});

function Section({
  title,
  count,
  entries,
  duplicates,
  currentUserId,
  emptyLabel,
  startAt,
}: {
  title: string;
  count: string;
  entries: ListEntry[];
  duplicates: Set<string>;
  currentUserId: string;
  emptyLabel: string;
  startAt?: number;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-muted-foreground text-sm tabular-nums">{count}</span>
      </header>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <ol className="divide-border bg-card divide-y overflow-hidden rounded-2xl shadow-sm ring-1 ring-foreground/8">
          {entries.map((entry, index) => {
            const isMe = entry.user_id === currentUserId;
            const number = startAt !== undefined ? startAt + index : entry.position;

            return (
              <li
                key={entry.user_id}
                style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                className={cn(
                  "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards flex items-center gap-3 px-3 py-2.5 duration-300",
                  isMe && "bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                    startAt === undefined && number === 1 && "bg-gold text-black/80",
                    startAt === undefined && number === 2 && "bg-zinc-300 text-black/75",
                    startAt === undefined && number === 3 && "bg-amber-600/80 text-white",
                    (startAt !== undefined || number > 3) && "bg-muted text-muted-foreground",
                  )}
                >
                  {number}
                </span>

                <Avatar
                  size="sm"
                  className={cn("shrink-0", isMe && "ring-primary ring-2 ring-offset-1 ring-offset-card")}
                >
                  <AvatarImage
                    src={avatarUrl(entry.avatar_path, entry.avatar_updated_at) ?? undefined}
                    alt=""
                  />
                  <AvatarFallback>{entry.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>

                <span className="min-w-0 flex-1 truncate">
                  <span className={cn("truncate", isMe && "font-semibold")}>
                    {entryLabel(entry, duplicates)}
                  </span>
                  {isMe && (
                    <span className="text-muted-foreground ml-1.5 text-xs">(você)</span>
                  )}
                </span>

                {entry.added_by_admin && (
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <ShieldCheck className="size-3" aria-hidden />
                    admin
                  </Badge>
                )}

                <time
                  dateTime={entry.joined_at}
                  className="text-muted-foreground shrink-0 text-xs tabular-nums"
                >
                  {formatTimeWithSeconds(entry.joined_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
