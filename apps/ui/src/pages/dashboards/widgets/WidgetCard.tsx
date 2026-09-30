import { usePermissions } from "@/contexts/AuthContext";
import type { FC } from "react";
import type { Widget } from "@gridone/sdk";
import { WidgetActions } from "./WidgetActions";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetView } from "./registry";

/** Widget actions appear during dashboard configuration. Layout editing
 *  hides them and marks the cell as draggable. */
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
