import type { FC } from "react";
import type { Widget } from "@gridone/sdk";
import { WidgetView } from "./WidgetView";

/** A single grid cell: a bordered card with an optional title bar and the
 *  widget body. Fills its grid cell (react-grid-layout sizes the wrapper). */
export const WidgetCard: FC<{ widget: Widget }> = ({ widget }) => (
  <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
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
