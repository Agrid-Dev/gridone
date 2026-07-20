import type { FC } from "react";
import type { Widget } from "@gridone/sdk";
import { WidgetActions } from "./WidgetActions";
import { WidgetView } from "./WidgetView";

/** A single grid cell: a bordered card with an optional title bar and the
 *  widget body, plus a hover ⋮ menu (edit / delete). Fills its grid cell
 *  (react-grid-layout sizes the wrapper). */
export const WidgetCard: FC<{ dashboardId: string; widget: Widget }> = ({
  dashboardId,
  widget,
}) => (
  <div className="group relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
    <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <WidgetActions dashboardId={dashboardId} widget={widget} />
    </div>
    {widget.title && (
      <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-foreground">
        {widget.title}
      </div>
    )}
    <div className="min-h-0 flex-1">
      <WidgetView widget={widget} />
    </div>
  </div>
);
