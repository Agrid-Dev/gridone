import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useMemo } from "react";
import type { FC } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import type { Dashboard } from "@gridone/sdk";
import { WidgetCard } from "./widgets/WidgetCard";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Desktop-first: one authored 12-column layout. Below the `lg` width the grid
// collapses to a single column, stacked in layout order (react-grid-layout
// generates the 1-column layout from the authored one). No per-breakpoint
// editing in v0.
const COLS = { lg: 12, xs: 1 };
const BREAKPOINTS = { lg: 768, xs: 0 };
const ROW_HEIGHT = 72;

/** Read-only widget grid: renders widgets at their stored positions/sizes. */
export const DashboardGrid: FC<{ dashboard: Dashboard }> = ({ dashboard }) => {
  const widgets = dashboard.widgets ?? [];
  const layout = useMemo<Layout[]>(
    () =>
      (dashboard.layout ?? []).map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
    [dashboard.layout],
  );

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layout }}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      isDraggable={false}
      isResizable={false}
    >
      {widgets.map((widget) => (
        <div key={widget.id}>
          <WidgetCard dashboardId={dashboard.id} widget={widget} />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};
