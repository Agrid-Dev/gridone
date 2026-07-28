import type { FC } from "react";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { operatorsFor, useAggregateOptions } from "@/hooks/useAggregateOptions";
import { useDeviceById } from "@/hooks/useDeviceById";
import { attributeDataType } from "@/lib/devices";

/**
 * Config fields for the chart widget: which device, which attribute, and how to
 * reduce it over time.
 *
 * Device and attribute are picked together — an attribute only means something
 * against a device — so a shared picker owns both fields rather than the
 * schema-driven one-input-per-property default, which would render a device id
 * as free text.
 */
export const ChartConfigFields: FC<{ control: Control<FieldValues> }> = ({
  control,
}) => {
  const { t } = useTranslation("dashboards");
  const { field: deviceField } = useController({
    control,
    name: "config.device_id",
  });
  const { field: attributeField } = useController({
    control,
    name: "config.attribute",
  });
  const { field: aggField } = useController({ control, name: "config.agg" });

  const deviceId = (deviceField.value as string) || undefined;
  const attribute = (attributeField.value as string) || undefined;

  const { data: device } = useDeviceById(deviceId);
  const { data: options } = useAggregateOptions();

  const dataType =
    device && attribute ? attributeDataType(device, attribute) : undefined;

  // Only the operators this attribute's type admits. Until one is picked the
  // list is empty, leaving "no aggregation" as the only choice — which is also
  // the default, so the field is never in a state it can't explain.
  const aggOptions = operatorsFor(options, dataType).map((op) => ({
    value: op as string | null,
    label: t(`widgets.chart.operators.${op}` as "widgets.chart.operators.avg"),
  }));

  return (
    <>
      <DeviceAttributePicker
        deviceId={deviceId}
        attribute={attribute}
        onChange={(next) => {
          deviceField.onChange(next.deviceId);
          attributeField.onChange(next.attribute);
          // Operators are per data type, so one chosen for a temperature isn't
          // offered for a mode. Keeping it across the switch would save a pair
          // the API refuses, and the widget would render an error, not a chart.
          if (next.attribute !== attribute) aggField.onChange(null);
        }}
        required
      />
      <SelectController<FieldValues, "config.agg", string | null>
        name="config.agg"
        control={control}
        label={t("widgets.chart.agg.label")}
        description={t("widgets.chart.agg.description")}
        // `null` is the stored value for raw, and the trigger falls back to the
        // placeholder for it — so raw reads as a named choice, not an empty one.
        placeholder={t("widgets.chart.agg.raw")}
        options={[
          { value: null, label: t("widgets.chart.agg.raw") },
          ...aggOptions,
        ]}
      />
    </>
  );
};
