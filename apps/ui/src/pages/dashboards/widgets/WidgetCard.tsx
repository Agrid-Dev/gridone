import { usePermissions } from "@/contexts/AuthContext";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import type { Widget } from "@gridone/sdk";
import { WidgetActions } from "./WidgetActions";
import { WidgetErrorState } from "./WidgetErrorState";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetView } from "./registry";

/** Widget actions appear during dashboard configuration. Layout editing
 *  hides them, marks the cell as draggable and makes the body inert, so a
 *  press drags the cell rather than panning a plate.
 *
 *  A widget the backend flagged on read (`error`: its stored config no longer
 *  validates, or its type no longer fits the dashboard's) keeps its cell and
 *  its actions — so the author can remove or rename it — but shows the reason
 *  instead of a body that would read a config it cannot trust. */
export const WidgetCard: FC<{
  dashboardId: string;
  widget: Widget;
  editing?: boolean;
  showActions?: boolean;
}> = ({ dashboardId, widget, editing = false, showActions = false }) => {
  const { t } = useTranslation("dashboards");
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
      {widget.error ? (
        <WidgetErrorState message={t(`widgets.errors.${widget.error}`)} />
      ) : (
        <WidgetView type={widget.type} config={widget.config} />
      )}
    </WidgetFrame>
  );
};
