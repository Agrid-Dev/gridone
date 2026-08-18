import { useEffect, type FC } from "react";
import type { DataType } from "@gridone/sdk";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import {
  AttributeTargetPicker,
  useAttributeCoverage,
  type AttributeTarget,
} from "@/components/forms/targetPicker";
import { SelectController } from "@/components/forms/controllers/SelectController";
import {
  operatorsFor,
  spaceOperatorsFor,
  useAggregateOptions,
  useResetRefusedOperator,
} from "@/hooks/useAggregateOptions";
import { useDevicesList } from "@/hooks/useDevicesList";
import { isEmptyFilter } from "@/lib/devices";

/** How "plot the readings as recorded" reads in the operator list. The config
 *  stores `null` for it. */
const RAW = "raw";

/** How "one series per device" reads in the space operator list. The config
 *  stores `null` for it. */
const NONE = "none";

/** True when the criteria select at least one device dimension. */
export function hasDeviceCriterion(devices: unknown): boolean {
  if (typeof devices !== "object" || devices === null) return false;
  const { ids, types, tags } = devices as Record<string, unknown>;
  return (
    (Array.isArray(ids) && ids.length > 0) ||
    (Array.isArray(types) && types.length > 0) ||
    (!!tags && typeof tags === "object" && Object.keys(tags).length > 0)
  );
}

/**
 * What the widget's JSON Schema cannot say about a chart config: an empty
 * device filter is schema-valid (it means "all devices" on the wire) but never
 * an intentional chart target, so the form must not submit one. Layered over
 * the schema-derived resolver by the form (see `widgetConfigChecks`); loose
 * objects leave everything else to the schema.
 */
export const chartConfigCheck = z.looseObject({
  target: z.looseObject({
    devices: z.custom<AttributeTarget["devices"]>(hasDeviceCriterion),
  }),
});

/** The picker needs a well-formed target to render; the schema-driven default
 *  for an object property is `""`, which is what a new widget starts from. */
export function toPickerTarget(value: unknown): AttributeTarget {
  if (typeof value !== "object" || value === null) return { devices: {} };
  const { devices, attribute } = value as Partial<AttributeTarget>;
  return { devices: devices ?? {}, attribute };
}

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
export const AggOption: FC<{
  name: string;
  resultType?: DataType | null;
  /** Which caption set glosses the name — time operators by default. */
  kind?: "agg" | "space";
}> = ({ name, resultType, kind = "agg" }) => {
  const { t } = useTranslation("dashboards");
  return (
    <span className="flex w-full items-baseline gap-2">
      <span>{name}</span>
      <span className="text-xs text-muted-foreground">
        {t(
          `widgets.chart.${kind}.captions.${name}` as "widgets.chart.agg.captions.avg",
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
 * Config fields for the chart widget: which device set, which attribute, and
 * how to reduce it over time.
 *
 * The device set and attribute form one target — an attribute only means
 * something against a set — so the shared target picker owns the whole
 * `config.target` field rather than the schema-driven one-input-per-property
 * default, which would render device ids as free text. Plotting needs no
 * write access, so the picker offers every attribute the set records.
 */
export const ChartConfigFields: FC<{ control: Control<FieldValues> }> = ({
  control,
}) => {
  const { t } = useTranslation("dashboards");
  const { field: targetField } = useController({
    control,
    name: "config.target",
  });
  const { field: aggField } = useController({ control, name: "config.agg" });
  const { field: spaceAggField } = useController({
    control,
    name: "config.space_agg",
  });

  const target = toPickerTarget(targetField.value);
  const agg = (aggField.value as string | null) ?? null;
  const spaceAgg = (spaceAggField.value as string | null) ?? null;

  const { devices } = useDevicesList();
  const { data: options } = useAggregateOptions();

  // The attribute's data type over the whole set — the same coverage read the
  // picker annotates its options with, so the cache is shared. A drifted set
  // can record the attribute under several types; that offers no type at all,
  // exactly as when nothing is picked yet.
  const { coverage } = useAttributeCoverage(target.devices, {
    enabled: !isEmptyFilter(target.devices),
  });
  const dataTypes = coverage.find(
    (c) => c.attribute === target.attribute,
  )?.data_types;
  const dataType = dataTypes?.length === 1 ? dataTypes[0] : undefined;

  // Every operator is listed, with the ones this attribute's type refuses shown
  // disabled rather than dropped: a list that silently shortens leaves you
  // unable to tell an operator that doesn't apply here from one that doesn't
  // exist, and unable to see that picking a different attribute would offer it.
  const operators = operatorsFor(options, dataType);
  const aggOptions = operators.map(({ operator, resultType }) => ({
    value: operator as string | null,
    label: <AggOption name={operator} resultType={resultType} />,
    disabled: resultType === null,
  }));

  // Waits for the type and the matrix — until both are known, "unsupported"
  // cannot be told from "not loaded yet".
  useResetRefusedOperator(agg, dataType, operators, aggField.onChange, null);

  // Space runs on what the time operator yields, so its options are the same
  // matrix read against the time output type — `avg` then `sum` of floats
  // stays float, `mode` of a str-mode chain stays str. Only the space
  // vocabulary is offered; the rest cannot fold a device set at all.
  const timeOutputType = agg
    ? (operators.find((o) => o.operator === agg)?.resultType ?? undefined)
    : undefined;
  const spaceOperators = spaceOperatorsFor(options, timeOutputType);
  const spaceAggOptions = spaceOperators.map(({ operator, resultType }) => ({
    value: operator as string | null,
    label: <AggOption name={operator} resultType={resultType} kind="space" />,
    disabled: resultType === null,
  }));

  // Raw series cannot be space-aggregated, so dropping the time operator also
  // drops the space one; a chain the new types refuse resets the same way the
  // time operator does above.
  const spaceRefused =
    !!spaceAgg &&
    (!agg ||
      (!!timeOutputType &&
        spaceOperators.some(
          (o) => o.operator === spaceAgg && o.resultType === null,
        )));

  useEffect(() => {
    if (spaceRefused) spaceAggField.onChange(null);
  }, [spaceRefused, spaceAggField]);

  return (
    <>
      <AttributeTargetPicker
        value={target}
        onChange={targetField.onChange}
        devices={devices}
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
      {agg !== null && (
        <SelectController<FieldValues, "config.space_agg", string | null>
          name="config.space_agg"
          control={control}
          label={t("widgets.chart.space.label")}
          description={t("widgets.chart.space.description")}
          // `null` keeps today's behavior — one series per device — and reads
          // as a named choice rather than an empty select.
          placeholder={<AggOption name={NONE} kind="space" />}
          options={[
            { value: null, label: <AggOption name={NONE} kind="space" /> },
            ...spaceAggOptions,
          ]}
        />
      )}
    </>
  );
};
