"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The header's sign-out icon, which spins while the sign-out is on its way. */
export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" size="icon" aria-label="Sair" disabled={pending}>
      {pending ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-5" aria-hidden />
      )}
    </Button>
  );
}
