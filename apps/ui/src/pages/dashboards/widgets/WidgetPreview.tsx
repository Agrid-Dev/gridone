import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { LayoutTemplate } from "lucide-react";
import type { WidgetLayout } from "@gridone/sdk";
import { COLUMNS, GRID_MARGIN, ROW_HEIGHT } from "../DashboardGrid";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetView } from "./registry";
import type { WidgetFormValues } from "./WidgetForm";

/** Grid footprint of a widget being created, until the backend assigns the
 *  registered default size for its type on add. */
export const DEFAULT_PREVIEW_SIZE: Pick<WidgetLayout, "w" | "h"> = {
  w: 4,
  h: 2,
};

/** Width the grid gets on a typical desktop dashboard (the max-w-7xl main
 *  column minus its padding). The preview renders at that scale so a widget is
 *  previewed at the size it will occupy once placed. */
const REFERENCE_GRID_WIDTH = 1120;

const CELL_WIDTH =
  (REFERENCE_GRID_WIDTH - (COLUMNS - 1) * GRID_MARGIN) / COLUMNS;

/** Pixel size of a `w`×`h` grid footprint, margins between cells included. */
function footprint({ w, h }: Pick<WidgetLayout, "w" | "h">) {
  return {
    width: w * CELL_WIDTH + (w - 1) * GRID_MARGIN,
    height: h * ROW_HEIGHT + (h - 1) * GRID_MARGIN,
  };
}

/**
 * Right-hand panel of the widget editor: the widget as the dashboard will
 * render it, framed and sized like the real tile. Until the form satisfies its
 * type's schema there is nothing valid to render, so the panel holds a
 * placeholder instead.
 */
export const WidgetPreview: FC<{
  draft: WidgetFormValues | null;
  size?: Pick<WidgetLayout, "w" | "h">;
}> = ({ draft, size = DEFAULT_PREVIEW_SIZE }) => {
  const { t } = useTranslation("dashboards");
  const { width, height } = footprint(size);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {t("widgets.editor.preview")}
      </p>
      <div className="flex justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6">
        <div style={{ width, height, maxWidth: "100%" }}>
          {draft ? (
            <WidgetFrame title={draft.title || null}>
              <WidgetView
                type={String(draft.config.type)}
                config={draft.config}
              />
            </WidgetFrame>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-4 text-center">
              <LayoutTemplate
                className="h-5 w-5 text-muted-foreground/60"
                aria-hidden
              />
              <p className="max-w-[24ch] text-sm text-muted-foreground">
                {t("widgets.editor.previewPlaceholder")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
