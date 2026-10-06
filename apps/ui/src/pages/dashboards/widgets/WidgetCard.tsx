import { usePermissions } from "@/contexts/AuthContext";
import type { FC } from "react";
import type { Widget } from "@gridone/sdk";
import { WidgetActions } from "./WidgetActions";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetView } from "./registry";

/** Widget actions appear during dashboard configuration. Layout editing
 *  hides them, marks the cell as draggable and makes the body inert, so a
 *  press drags the cell rather than panning a plate. */
export const WidgetCard: FC<{
  dashboardId: string;
  widget: Widget;
  editing?: boolean;
  showActions?: boolean;
}> = ({ dashboardId, widget, editing = false, showActions = false }) => {
  const can = usePermissions();
  return (
    <WidgetFrame
      title={widget.title}
      inert={editing}
      className={editing ? "cursor-grab ring-2 ring-primary/40" : undefined}
      overlay={
        !showActions || editing || !can("dashboards:write") ? null : (
          <WidgetActions dashboardId={dashboardId} widget={widget} />
        )
      }
    >
      <WidgetView type={widget.type} config={widget.config} />
    </WidgetFrame>
  );
};
