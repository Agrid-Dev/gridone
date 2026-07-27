import type { FC } from "react";
import type { Widget } from "@gridone/sdk";
import { WidgetActions } from "./WidgetActions";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetView } from "./registry";

/** A single grid cell: the shared widget frame plus, in view mode, a hover ⋮
 *  menu offering edit / delete. In layout edit mode those actions are hidden
 *  (separate flows) and the cell reads as draggable. */
export const WidgetCard: FC<{
  dashboardId: string;
  widget: Widget;
  editing?: boolean;
}> = ({ dashboardId, widget, editing = false }) => (
  <WidgetFrame
    title={widget.title}
    className={editing ? "cursor-grab ring-2 ring-primary/40" : undefined}
    overlay={
      editing ? null : (
        <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <WidgetActions dashboardId={dashboardId} widget={widget} />
        </div>
      )
    }
  >
    <WidgetView type={widget.type} config={widget.config} />
  </WidgetFrame>
);
