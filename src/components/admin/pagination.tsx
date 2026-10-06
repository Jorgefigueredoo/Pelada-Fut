import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Simple prev/next pager, driven by the URL so the list stays server-rendered. */
export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  /** Other query params to carry over, e.g. the search term. */
  searchParams?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <div className="flex items-center justify-between pt-1">
      <Button asChild variant="outline" size="sm" disabled={page <= 1}>
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </Link>
      </Button>

      <span className="text-muted-foreground text-sm">
        Página {page} de {totalPages}
      </span>

      <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
        >
          Próxima
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
