import { Skeleton } from "@/components/ui/skeleton";

/**
 * Every authenticated page is dynamic (never cached), so without this a tap on a tab
 * showed nothing until the whole page came back from the server. With it, Next
 * prefetches everything down to this boundary in production and the tap answers at
 * once with this shape while the real page loads.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-40 rounded-xl" />

      <div className="bg-card ring-foreground/8 overflow-hidden rounded-2xl shadow-sm ring-1">
        <Skeleton className="h-28 rounded-none" />
        <div className="space-y-4 p-4">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: 4 }, (_unused, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 flex-1 rounded-md" />
            <Skeleton className="h-3 w-14 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
