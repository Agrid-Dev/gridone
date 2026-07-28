import type { FC } from "react";
import type { DataType } from "@gridone/sdk";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { operatorsFor, useAggregateOptions } from "@/hooks/useAggregateOptions";
import { useDeviceById } from "@/hooks/useDeviceById";
import { attributeDataType } from "@/lib/devices";

/** How "plot the readings as recorded" reads in the operator list. The config
 *  stores `null` for it. */
const RAW = "raw";

/**
 * One entry in the aggregation list: the operator's own name, a short gloss,
 * and the type it would yield for the chosen attribute.
 *
 * The name leads because these are terms of art, kept as they are written
 * everywhere else — spelling `tw_avg` out in full crowds the attribute it
 * qualifies, and each reading would then differ by language. The gloss carries
 * the meaning without displacing the term.
 *
 * The result type is worth showing because aggregating can change it: `count`
 * yields an int whatever went in, and averaging a bool yields a float, which is
 * what decides whether the widget draws a line or an on/off band.
 */
const AggOption: FC<{ name: string; resultType?: DataType | null }> = ({
  name,
  resultType,
}) => {
  const { t } = useTranslation("dashboards");
  return (
    <span className="flex w-full items-baseline gap-2">
      <span>{name}</span>
      <span className="text-xs text-muted-foreground">
        {t(
          `widgets.chart.agg.captions.${name}` as "widgets.chart.agg.captions.avg",
        )}
      </span>
      {resultType !== undefined && (
        <span className="ml-auto pl-3 text-xs text-muted-foreground">
          {resultType ?? t("widgets.chart.agg.unsupported")}
        </span>
      )}
    </span>
  );
};

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

  // Every operator is listed, with the ones this attribute's type refuses shown
  // disabled rather than dropped: a list that silently shortens leaves you
  // unable to tell an operator that doesn't apply here from one that doesn't
  // exist, and unable to see that picking a different attribute would offer it.
  const aggOptions = operatorsFor(options, dataType).map(
    ({ operator, resultType }) => ({
      value: operator as string | null,
      label: <AggOption name={operator} resultType={resultType} />,
      disabled: resultType === null,
    }),
  );

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
        // It carries no result type: it yields whatever the attribute records.
        placeholder={<AggOption name={RAW} />}
        options={[
          { value: null, label: <AggOption name={RAW} /> },
          ...aggOptions,
        ]}
      />
    </>
  );
};
