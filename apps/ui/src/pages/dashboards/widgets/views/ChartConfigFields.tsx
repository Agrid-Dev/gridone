import { useDeferredValue, useEffect, type FC } from "react";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import {
  AttributeTargetPicker,
  toPickerTarget,
  useAttributeCoverage,
  type AttributeTarget,
} from "@/components/forms/targetPicker";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { CHART_COLORS } from "@/components/charts/TimeSeriesChart/constants";
import { AggOption } from "@/hooks/AggOption";
import { IntervalOption } from "./IntervalOption";
import { MarkOption } from "./MarkOption";
import {
  operatorsFor,
  spaceOperatorsFor,
  useAggregateOptions,
  useResetRefusedOperator,
} from "@/hooks/useAggregateOptions";
import { useDevicesList } from "@/hooks/useDevicesList";
import { isEmptyFilter, UNTAGGED_GROUP_LABEL } from "@/lib/devices";
import { useTagGroups } from "./useTagGroups";

/** How "plot the readings as recorded" reads in the operator list. The config
 *  stores `null` for it. */
const RAW = "raw";

/** The stored width that leaves the choice to the server. */
const AUTO = "auto";

/** Types whose aggregates are quantities, and so can be drawn as bars — a
 *  bar's height reads as a magnitude, which an on/off state or a mode has
 *  none of. Read against what the operator *yields*, not what the attribute
 *  records: `count` makes a number out of anything. */
const BAR_CAPABLE_TYPES = new Set(["float", "int"]);

/** How each series is drawn. `line` is the stored default. */
const MARKS = ["line", "bar"] as const;

/** How "one series per device" reads in the space operator list. The config
 *  stores `null` for it. */
const NONE = "none";

/** Widths the endpoint offers that a chart has no use for: `raw` hands back
 *  the stored points and applies no operator at all, and `whole` reduces the
 *  period to a single bucket — one point is a reading, not a chart. */
const NON_CHART_INTERVALS = new Set(["raw", "whole"]);

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
  const { field: intervalField } = useController({
    control,
    name: "config.interval",
  });
  const { field: markField } = useController({ control, name: "config.mark" });
  const { field: spaceAggField } = useController({
    control,
    name: "config.space_agg",
  });
  const { field: groupByField } = useController({
    control,
    name: "config.group_by",
  });

  const target = toPickerTarget(targetField.value);
  const agg = (aggField.value as string | null) ?? null;
  const interval = (intervalField.value as string | undefined) ?? AUTO;
  const mark = (markField.value as string | undefined) ?? "line";
  const spaceAgg = (spaceAggField.value as string | null) ?? null;
  const groupBy = (groupByField.value as string | null) || null;

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

  // Widths come from the same response as the operators, so the ladder a
  // deployment offers is the backend's to publish — one added there appears
  // here without a UI change, exactly as `delta` did among the operators.
  // They are listed unsized: the options endpoint can count buckets only for a
  // window, and the window is the dashboard's, chosen after the widget is
  // saved and changed freely afterwards.
  const intervalOptions = (options?.intervals ?? [])
    .map((option) => option.interval)
    .filter((iv) => !NON_CHART_INTERVALS.has(iv))
    .map((iv) => ({ value: iv, label: <IntervalOption interval={iv} /> }));

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

  // What the chart will actually plot: aggregating changes the type (`count`
  // yields ints whatever went in), and the space fold runs on that in turn.
  // Undefined until the chain is known — an attribute with no resolved type
  // yet neither offers bars nor refuses them.
  const spaceOutputType = spaceAgg
    ? (spaceOperators.find((o) => o.operator === spaceAgg)?.resultType ??
      undefined)
    : timeOutputType;
  const plottedType = agg ? spaceOutputType : dataType;
  const barsApply =
    agg !== null && !!plottedType && BAR_CAPABLE_TYPES.has(plottedType);

  // Refusing bars is not the same as not offering them: `barsApply` is also
  // false while the coverage read and the operator matrix are still loading,
  // and resetting on that would turn a saved bar chart back into a line the
  // moment its editor opened — leaving the form dirty, so the downgrade would
  // then save. The operator is config and known synchronously; the type has to
  // resolve before it can refuse anything. Same distinction `spaceRefused`
  // makes above, and the one `useResetRefusedOperator` documents.
  const barsRefused =
    mark === "bar" &&
    (agg === null ||
      (plottedType !== undefined && !BAR_CAPABLE_TYPES.has(plottedType)));

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

  // group_by needs a fold operator, same as the backend requires — cleared in
  // the same pass as a refused spaceAgg reset, not one render behind it. An
  // empty input also means "cleared", normalized to the stored `null` here.
  useEffect(() => {
    if (spaceRefused) spaceAggField.onChange(null);
    if (((spaceRefused || !spaceAgg) && groupBy) || groupByField.value === "") {
      groupByField.onChange(null);
    }
  }, [spaceRefused, spaceAgg, groupBy, spaceAggField, groupByField]);

  // A width only cuts buckets an operator fills, so dropping the operator
  // drops the width with it — the same rule the space operator follows one
  // effect up. Charts stored before the field existed arrive without it, and
  // normalize to the same stored default rather than showing an empty select.
  useEffect(() => {
    if (intervalField.value === undefined) intervalField.onChange(AUTO);
    else if (agg === null && interval !== AUTO) intervalField.onChange(AUTO);
  }, [agg, interval, intervalField]);

  // Bars need buckets to span and a magnitude to stand for, and a saved chart
  // can lose either — its operator dropped here, or its device set re-driven
  // under it to a type that no longer plots as a quantity. Falling back to
  // lines keeps the widget saveable: the backend refuses bars without an
  // operator outright. Charts stored before the field existed normalize to the
  // same stored default.
  useEffect(() => {
    if (markField.value === undefined) markField.onChange("line");
    else if (barsRefused) markField.onChange("line");
  }, [barsRefused, markField]);

  // Deferred so a keystroke doesn't fire a request per character — the query
  // key includes the tag key, and reacting to every intermediate value would
  // spam GET /devices/tag-groups while typing.
  const deferredGroupBy = useDeferredValue(groupBy);
  const {
    groups: tagGroups,
    totalDevices: tagGroupsTotal,
    isLoading: tagGroupsLoading,
    error: tagGroupsError,
  } = useTagGroups(target.devices, deferredGroupBy ?? "", target.attribute, {
    // An empty filter is a legal target (it means "all devices"), so the
    // preview must still run for it — only the tag key gates the request.
    enabled: !!deferredGroupBy,
  });

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
        <SelectController<FieldValues, "config.interval", string>
          name="config.interval"
          control={control}
          label={t("widgets.chart.interval.label")}
          description={t("widgets.chart.interval.description")}
          options={[
            { value: AUTO, label: <IntervalOption interval={AUTO} /> },
            ...intervalOptions,
          ]}
        />
      )}
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
      {spaceAgg !== null && (
        <>
          <InputController
            name="config.group_by"
            control={control}
            label={t("widgets.chart.groupBy.label")}
            description={t("widgets.chart.groupBy.description")}
            inputProps={{ placeholder: t("widgets.chart.groupBy.placeholder") }}
          />
          {groupBy && !tagGroupsLoading && (
            <p className="text-xs text-muted-foreground">
              {tagGroupsError
                ? t("widgets.chart.groupBy.previewError")
                : tagGroupsTotal === 0
                  ? t("widgets.chart.groupBy.previewEmpty")
                  : t("widgets.chart.groupBy.preview", {
                      total: tagGroupsTotal,
                      breakdown: tagGroups
                        .map(
                          (g) =>
                            `${g.label === UNTAGGED_GROUP_LABEL ? t("widgets.chart.groupBy.untagged") : g.label} (${g.device_count})`,
                        )
                        .join(", "),
                    })}
            </p>
          )}
          {groupBy &&
            !tagGroupsLoading &&
            tagGroups.length > CHART_COLORS.length && (
              <p className="text-xs text-amber-600">
                {t("widgets.chart.groupBy.highCardinality", {
                  count: tagGroups.length,
                  max: CHART_COLORS.length,
                })}
              </p>
            )}
        </>
      )}
      {barsApply && (
        <SelectController<FieldValues, "config.mark", string>
          name="config.mark"
          control={control}
          label={t("widgets.chart.mark.label")}
          description={t("widgets.chart.mark.description")}
          options={MARKS.map((value) => ({
            value: value as string,
            label: <MarkOption name={value} />,
          }))}
        />
      )}
    </>
  );
};
