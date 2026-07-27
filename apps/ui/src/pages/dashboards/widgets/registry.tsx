import type { FC } from "react";
import { TextWidgetView } from "./views/TextWidgetView";

/** A widget type's renderer. The config is untyped at the registry boundary;
 *  each view narrows it to its own config model. */
export type WidgetViewComponent = FC<{ config: unknown }>;

/**
 * Frontend widget registry: type discriminator → the component rendering that
 * type's body. The backend registry owns validation, sizing and JSON Schemas;
 * this one owns rendering. Adding a widget type is a matter of writing a view
 * and registering it here — nothing else branches on `type`.
 */
export const widgetViews: Record<string, WidgetViewComponent> = {
  text: TextWidgetView,
};

/** Renders a widget body from its type + config. Both the dashboard grid and
 *  the editor preview go through here, so what you preview is what you get.
 *  An unregistered type (backend newer than the UI) degrades to its name. */
export const WidgetView: FC<{ type: string; config: unknown }> = ({
  type,
  config,
}) => {
  const View = widgetViews[type];
  if (!View) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        {type}
      </div>
    );
  }
  return <View config={config} />;
};
