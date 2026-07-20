import type { FC } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { Widget } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { WidgetActions } from "./WidgetActions";
import { WidgetView } from "./WidgetView";

/** Compact in-tile fallback: a single widget that throws while rendering shows
 *  this instead of crashing the whole dashboard page. */
const WidgetErrorFallback: FC = () => {
  const { t } = useTranslation("dashboards");
  return (
    <div className="flex h-full items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
      <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
      {t("widgets.renderError")}
    </div>
  );
};

/** A single grid cell: a bordered card with an optional title bar and the
 *  widget body. In view mode a hover ⋮ menu offers edit / delete; in layout
 *  edit mode those actions are hidden (separate flows) and the cell reads as
 *  draggable. The body is isolated in an error boundary so one bad widget can't
 *  crash the page. */
export const WidgetCard: FC<{
  dashboardId: string;
  widget: Widget;
  editing?: boolean;
}> = ({ dashboardId, widget, editing = false }) => (
  <div
    className={cn(
      "group relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card",
      editing && "cursor-grab ring-2 ring-primary/40",
    )}
  >
    {!editing && (
      <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <WidgetActions dashboardId={dashboardId} widget={widget} />
      </div>
    )}
    {widget.title && (
      <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-foreground">
        {widget.title}
      </div>
    )}
    <div className="min-h-0 flex-1">
      <ErrorBoundary FallbackComponent={WidgetErrorFallback}>
        <WidgetView widget={widget} />
      </ErrorBoundary>
    </div>
  </div>
);
