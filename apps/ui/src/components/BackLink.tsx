import type { ReactNode } from "react";
import { Link, type To } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useResourceNavigation } from "@/hooks/useResourceNavigation";

/** Muted back link shown above a detail page's header, pointing to the
 *  parent list (e.g. "← Devices"). */
export function BackLink({ to, children }: { to: To; children: ReactNode }) {
  const { origin, back, backLabel } = useResourceNavigation();
  return (
    <Link
      to={origin?.url ?? to}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          back(to);
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      {backLabel ?? children}
    </Link>
  );
}
