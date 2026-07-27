import type { FC } from "react";
import type { TextWidgetConfig } from "@gridone/sdk";

/** Pick a readable text color (black/white) for a hex background via relative
 *  luminance — keeps the text legible on any chosen widget color. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

// Soften the placeholder text widget's background (8-digit hex alpha) so the
// colored blocks read as tinted panels rather than full-saturation swatches.
const BACKGROUND_ALPHA = "D9"; // ~85%

/** Body of a `text` widget. The config arrives untyped from the registry — a
 *  view is the only place that knows its own type's shape. */
export const TextWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { text, color } = config as TextWidgetConfig;
  return (
    <div
      className="flex h-full w-full items-center justify-center p-4"
      style={{
        backgroundColor: `${color}${BACKGROUND_ALPHA}`,
        color: contrastText(color),
      }}
    >
      <span className="break-words text-center text-sm font-medium">
        {text}
      </span>
    </div>
  );
};
