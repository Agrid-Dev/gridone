import type { FC } from "react";
import type { Control, FieldValues } from "react-hook-form";
import type * as z from "zod";
import { ChartConfigFields, chartConfigCheck } from "./views/ChartConfigFields";
import { ChartWidgetView } from "./views/ChartWidgetView";
import { DeviceControlConfigFields } from "./views/DeviceControlConfigFields";
import { DeviceControlWidgetView } from "./views/DeviceControlWidgetView";
import {
  KpiConfigFields,
  kpiConfigCheck,
  kpiPreviewSize,
} from "./views/KpiConfigFields";
import { KpiWidgetView } from "./views/KpiWidgetView";
import { MeterTreeConfigPlaceholder } from "./views/MeterTreeConfigPlaceholder";
import { MeterTreeWidgetView } from "./views/MeterTreeWidgetView";
import { TextWidgetView } from "./views/TextWidgetView";

/** A widget type's renderer. The config is untyped at the registry boundary;
 *  each view narrows it to its own config model. */
export type WidgetViewComponent = FC<{ config: unknown }>;

/** A widget type's config editor, replacing the schema-derived fields. It owns
 *  only the fields region — title, validation and submit stay with the form. */
export type WidgetConfigFieldsComponent = FC<{
  control: Control<FieldValues>;
}>;

/**
 * Frontend widget registry: type discriminator → the component rendering that
 * type's body. The backend registry owns validation, sizing and JSON Schemas;
 * this one owns rendering. Adding a widget type is a matter of writing a view
 * and registering it here — nothing else branches on `type`.
 */
export const widgetViews: Record<string, WidgetViewComponent> = {
  text: TextWidgetView,
  chart: ChartWidgetView,
  device_control: DeviceControlWidgetView,
  kpi: KpiWidgetView,
  meter_tree: MeterTreeWidgetView,
};

/**
 * Type discriminator → a hand-written config editor, for the types whose config
 * can't be derived from its JSON Schema. A device id is a string in the schema,
 * but a text input asking for one is unusable; the chart needs a picker.
 *
 * Registering here is opt-in — a type with no entry keeps the schema-driven
 * fields, so the default path stays the norm rather than the exception.
 */
export const widgetConfigFields: Record<string, WidgetConfigFieldsComponent> = {
  chart: ChartConfigFields,
  device_control: DeviceControlConfigFields,
  kpi: KpiConfigFields,
  meter_tree: MeterTreeConfigPlaceholder,
};

/**
 * Type discriminator → validation the type's JSON Schema cannot express, for
 * the types that need one. The form intersects it with the schema-derived
 * resolver, so a registered check only ever tightens what the schema already
 * accepts — it cannot loosen the wire contract.
 */
export const widgetConfigChecks: Record<string, z.ZodType> = {
  chart: chartConfigCheck,
  kpi: kpiConfigCheck,
};

/** A widget type's live-preview footprint, from its draft config and the
 *  footprint it would otherwise get. Registering here — not in the generic
 *  editor — keeps type-specific sizing knowledge with the rest of that
 *  type's editor code (the backend registry stays sizing's source of truth;
 *  this only approximates it before save, see kpiPreviewSize). */
export type WidgetPreviewSizeFn = (
  config: Record<string, unknown> | undefined,
  baseSize: { w: number; h: number },
) => { w: number; h: number };

export const widgetPreviewSize: Record<string, WidgetPreviewSizeFn> = {
  kpi: kpiPreviewSize,
};

/** No-op sizing rule for a type not in `widgetPreviewSize`. */
export const identityPreviewSize: WidgetPreviewSizeFn = (_config, base) => base;

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
