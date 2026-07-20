import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { FC } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import type { Dashboard } from "@gridone/sdk";
import { WidgetCard } from "./widgets/WidgetCard";
import type { GridLayoutItem } from "./useLayoutEditor";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Desktop-first: one authored 12-column layout. Below the `lg` width the grid
// collapses to a single column, stacked in layout order (react-grid-layout
// generates the 1-column layout from the authored one). No per-breakpoint
// editing in v0. `compactType={null}` keeps widgets at their authored
// positions (WYSIWYG) instead of auto-reflowing.
const COLS = { lg: 12, xs: 1 };
const BREAKPOINTS = { lg: 768, xs: 0 };
const ROW_HEIGHT = 72;

interface DashboardGridProps {
  dashboard: Dashboard;
  /** The layout to render — the stored one in view mode, the working copy in
   *  edit mode. */
  layout: GridLayoutItem[];
  editing: boolean;
  onLayoutChange: (layout: GridLayoutItem[]) => void;
}

/** Widget grid. Read-only in view mode; draggable/resizable in layout edit
 *  mode, where per-widget actions are hidden (layout and widget edits are
 *  separate flows). */
export const DashboardGrid: FC<DashboardGridProps> = ({
  dashboard,
  layout,
  editing,
  onLayoutChange,
}) => {
  const widgets = dashboard.widgets ?? [];

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layout as Layout[] }}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      compactType={null}
      isDraggable={editing}
      isResizable={editing}
      onLayoutChange={(current, all) => onLayoutChange(all.lg ?? current)}
    >
      {widgets.map((widget) => (
        <div key={widget.id}>
          <WidgetCard
            dashboardId={dashboard.id}
            widget={widget}
            editing={editing}
          />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};
