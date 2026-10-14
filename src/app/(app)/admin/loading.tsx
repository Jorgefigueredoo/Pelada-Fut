import { Skeleton } from "@/components/ui/skeleton";

/**
 * Switching between the admin tabs, or opening a pelada or a player, answers at once
 * with this below the admin tabs instead of waiting for the server in silence.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-12 w-full rounded-xl" />
      {Array.from({ length: 3 }, (_unused, index) => (
        <div
          key={index}
          className="bg-card ring-foreground/8 space-y-2 rounded-2xl p-4 shadow-sm ring-1"
        >
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-4 w-1/2 rounded-md" />
          <Skeleton className="h-4 w-1/3 rounded-md" />
        </div>
      ))}
    </div>
  );
}
