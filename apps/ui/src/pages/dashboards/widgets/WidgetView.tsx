import type { FC } from "react";
import type { TextWidgetConfig, Widget } from "@gridone/sdk";

/** Pick a readable text color (black/white) for a hex background via relative
 *  luminance — keeps the text legible on any chosen widget color. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

const TextWidgetView: FC<{ config: TextWidgetConfig }> = ({ config }) => (
  <div
    className="flex h-full w-full items-center justify-center p-4"
    style={{ backgroundColor: config.color, color: contrastText(config.color) }}
  >
    <span className="break-words text-center text-sm font-medium">
      {config.text}
    </span>
  </div>
);

/** Renders a widget's body by type. This switch is the frontend widget
 *  registry; `text` is the only type today. */
export const WidgetView: FC<{ widget: Widget }> = ({ widget }) => {
  if (widget.type === "text") {
    return <TextWidgetView config={widget.config as TextWidgetConfig} />;
  }
  return (
    <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
      {widget.type}
    </div>
  );
};
