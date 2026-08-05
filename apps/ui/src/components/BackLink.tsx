import type { ReactNode } from "react";
import { Link, type To } from "react-router";
import { ArrowLeft } from "lucide-react";

/** Muted back link shown above a detail page's header, pointing to the
 *  parent list (e.g. "← Devices"). */
export function BackLink({ to, children }: { to: To; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}
