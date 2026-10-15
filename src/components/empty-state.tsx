import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** A friendly blank: a striped badge, a line that says what is missing and what comes next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="relative">
          <div className="bg-primary/20 absolute inset-0 animate-pulse rounded-3xl blur-xl" aria-hidden />
          <div className="bg-pitch-stripes text-gold relative grid size-16 place-items-center rounded-3xl shadow-lg shadow-primary/25">
            <Icon className="size-7" aria-hidden />
          </div>
        </div>
        <p className="text-base font-semibold">{title}</p>
        <p className="text-muted-foreground max-w-64 text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}
