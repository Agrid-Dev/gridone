import type { FC, ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { WidgetErrorState } from "./WidgetErrorState";

/** Compact in-tile fallback: a widget that throws while rendering shows this
 *  instead of crashing the dashboard page (or the editor). */
const WidgetErrorFallback: FC = () => {
  const { t } = useTranslation("dashboards");
  return <WidgetErrorState message={t("widgets.renderError")} />;
};

/** The chrome around a widget body: a bordered card with an optional title bar,
 *  an optional overlay slot (per-widget actions) and the body isolated in an
 *  error boundary. Shared by the dashboard grid and the editor preview so a
 *  previewed widget is framed exactly like the real one. */
export const WidgetFrame: FC<{
  title?: string | null;
  /** Rendered over the top-right corner of the card (e.g. the actions menu). */
  overlay?: ReactNode;
  /** The body takes no pointer and no focus: a cell being arranged, a
   *  preview. */
  inert?: boolean;
  className?: string;
  children: ReactNode;
}> = ({ title, overlay, inert = false, className, children }) => (
  <div
    className={cn(
      "group relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card",
      className,
    )}
  >
    {(title || overlay) && (
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
        <span className="min-w-0 truncate">{title}</span>
        {overlay}
      </div>
    )}
    {/* React 18 knows no `inert` prop: the attribute is passed as is. */}
    <div className="min-h-0 flex-1" {...(inert ? { inert: "" } : {})}>
      <ErrorBoundary FallbackComponent={WidgetErrorFallback}>
        {children}
      </ErrorBoundary>
    </div>
  </div>
);
