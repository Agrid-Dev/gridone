import type { FC } from "react";
import { TriangleAlert } from "lucide-react";

/** The body of a widget that cannot render as configured: one line under a
 *  warning glyph, filling the cell. Shared by the render-time boundary
 *  fallback, the read-time `error` the backend sets on a widget, and the
 *  registry's unknown-type fallback, so every broken cell looks the same. */
export const WidgetErrorState: FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="flex h-full items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground"
  >
    <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-destructive" />
    {message}
  </div>
);
