import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** One visible error line, so a failure on 4G never looks like nothing happened. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
