import type { FC } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type * as z from "zod";
import { WidgetErrorState } from "./WidgetErrorState";
import { ChartConfigFields, chartConfigCheck } from "./views/ChartConfigFields";
import { ChartWidgetView } from "./views/ChartWidgetView";
import { ControlPanelConfigFields } from "./views/ControlPanelConfigFields";
import { ControlPanelWidgetView } from "./views/ControlPanelWidgetView";
import { DeviceControlConfigFields } from "./views/DeviceControlConfigFields";
import { DeviceControlWidgetView } from "./views/DeviceControlWidgetView";
import {
  KpiHistoryConfigFields,
  KpiLiveConfigFields,
  kpiConfigCheck,
  kpiPreviewSize,
} from "./views/KpiConfigFields";
import { KpiHistoryWidgetView, KpiLiveWidgetView } from "./views/KpiWidgetView";
import { MeterTreeConfigPlaceholder } from "./views/MeterTreeConfigPlaceholder";
import { MeterTreeWidgetView } from "./views/MeterTreeWidgetView";
import { TextWidgetView } from "./views/TextWidgetView";
import { SynopticConfigFields } from "./views/SynopticConfigFields";
import { SynopticWidgetView } from "./views/SynopticWidgetView";

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
  kpi_live: KpiLiveWidgetView,
  kpi_history: KpiHistoryWidgetView,
  meter_tree: MeterTreeWidgetView,
  control_panel: ControlPanelWidgetView,
  synoptic: SynopticWidgetView,
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
  kpi_live: KpiLiveConfigFields,
  kpi_history: KpiHistoryConfigFields,
  meter_tree: MeterTreeConfigPlaceholder,
  control_panel: ControlPanelConfigFields,
  synoptic: SynopticConfigFields,
};

/**
 * Type discriminator → validation the type's JSON Schema cannot express, for
 * the types that need one. The form intersects it with the schema-derived
 * resolver, so a registered check only ever tightens what the schema already
 * accepts — it cannot loosen the wire contract.
 */
export const widgetConfigChecks: Record<string, z.ZodType> = {
  chart: chartConfigCheck,
  kpi_live: kpiConfigCheck,
  kpi_history: kpiConfigCheck,
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
  kpi_live: kpiPreviewSize,
  kpi_history: kpiPreviewSize,
};

/** No-op sizing rule for a type not in `widgetPreviewSize`. */
export const identityPreviewSize: WidgetPreviewSizeFn = (_config, base) => base;

/** Renders a widget body from its type + config. Both the dashboard grid and
 *  the editor preview go through here, so what you preview is what you get.
 *  An unregistered type (backend newer than the UI) degrades to an error
 *  tile naming it. */
export const WidgetView: FC<{ type: string; config: unknown }> = ({
  type,
  config,
}) => {
  const { t } = useTranslation("dashboards");
  const View = widgetViews[type];
  if (!View) {
    return (
      <WidgetErrorState message={t("widgets.errors.unknown_type", { type })} />
    );
  }
  return <View config={config} />;
};
