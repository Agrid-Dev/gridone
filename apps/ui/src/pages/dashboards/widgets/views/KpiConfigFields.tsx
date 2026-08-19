import { useEffect, type FC } from "react";
import type { AggregationOperator } from "@gridone/sdk";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import {
  AttributeTargetPicker,
  useAttributeCoverage,
  type AttributeTarget,
} from "@/components/forms/targetPicker";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  operatorsFor,
  spaceOperatorsFor,
  useAggregateOptions,
  useResetRefusedOperator,
} from "@/hooks/useAggregateOptions";
import { useDevicesList } from "@/hooks/useDevicesList";
import { isEmptyFilter } from "@/lib/devices";
import { AggOption, toPickerTarget } from "./ChartConfigFields";
import { isEmptyTarget } from "./useTargetDevices";

type Temporal = "live" | { operator?: AggregationOperator };

/** A single explicit device id, no other criteria: the target resolves to
 *  exactly one device on its own, no fold operator needed. */
function hasSingleDeviceCriterion(devices: unknown): boolean {
  if (typeof devices !== "object" || devices === null) return false;
  const { ids, types, tags } = devices as Record<string, unknown>;
  const hasTags =
    !!tags && typeof tags === "object" && Object.keys(tags).length > 0;
  return Array.isArray(ids) && ids.length === 1 && !types && !hasTags;
}

export const kpiConfigCheck = z
  .looseObject({
    target: z.looseObject({
      devices: z.custom<AttributeTarget["devices"]>(),
    }),
    space_agg: z.unknown().optional(),
  })
  .refine(
    (config) => {
      const devices = config.target.devices;
      // A criteria target (type/tags, or several ids) can match more than
      // one device, so it needs a fold operator to still show one number —
      // the same collapse-all semantics as the chart widget's space_agg.
      if (hasSingleDeviceCriterion(devices)) return true;
      return !isEmptyTarget(devices) && !!config.space_agg;
    },
    { path: ["target", "devices"] },
  );

/**
 * Config fields for the KPI widget: which device+attribute, and whether it
 * shows the current value or one reduced over the dashboard period.
 */
export const KpiConfigFields: FC<{ control: Control<FieldValues> }> = ({
  control,
}) => {
  const { t } = useTranslation("dashboards");
  const { field: targetField } = useController({
    control,
    name: "config.target",
  });
  const { field: temporalField } = useController({
    control,
    name: "config.temporal",
  });
  const { field: operatorField } = useController({
    control,
    name: "config.temporal.operator",
  });
  const { field: spaceAggField } = useController({
    control,
    name: "config.space_agg",
  });

  const target = toPickerTarget(targetField.value);
  const temporal = temporalField.value as Temporal | undefined;
  const isPeriod = typeof temporal === "object" && temporal !== null;
  const operator = isPeriod ? (temporal.operator ?? null) : null;
  const spaceAgg = (spaceAggField.value as string | null) ?? null;

  const { devices } = useDevicesList();
  const { data: options } = useAggregateOptions();

  const { coverage } = useAttributeCoverage(target.devices, {
    enabled: !isEmptyFilter(target.devices),
  });
  const dataTypes = coverage.find(
    (c) => c.attribute === target.attribute,
  )?.data_types;
  const dataType = dataTypes?.length === 1 ? dataTypes[0] : undefined;

  // Every operator is listed, with the ones this attribute's type refuses
  // shown disabled — same reasoning as the chart widget's aggregation list.
  const operators = operatorsFor(options, dataType);
  const operatorOptions = operators.map(({ operator: op, resultType }) => ({
    value: op as string,
    label: <AggOption name={op} resultType={resultType} />,
    disabled: resultType === null,
  }));

  useResetRefusedOperator(
    operator,
    dataType,
    operators,
    operatorField.onChange,
    undefined,
  );

  // A criteria target (type/tags, or several ids) can match more than one
  // device, so the tile needs a fold operator to still show one number — a
  // single explicit id needs none, it already resolves to one.
  const canMatchMultipleDevices =
    !isEmptyTarget(target.devices) && !hasSingleDeviceCriterion(target.devices);

  // Space runs on what the period operator yields, or directly on the raw
  // type for a live reading — there is no time reduction to chain through.
  // In period mode there is nothing to fold against until an operator is
  // picked, so the control waits for one — same as the chart widget's.
  const spaceDataType = isPeriod
    ? (operators.find((o) => o.operator === operator)?.resultType ?? undefined)
    : dataType;
  const spaceControlReady = !isPeriod || !!operator;
  const showSpaceControl = canMatchMultipleDevices && spaceControlReady;
  // The select is shown but nothing's picked yet: the schema check alone
  // just disables Save, so this names the reason near the field.
  const targetInvalid = showSpaceControl && !spaceAgg;

  const spaceOperators = spaceOperatorsFor(options, spaceDataType);
  const spaceOperatorOptions = spaceOperators.map(
    ({ operator: op, resultType }) => ({
      value: op as string,
      label: <AggOption name={op} resultType={resultType} kind="space" />,
      disabled: resultType === null,
    }),
  );

  useResetRefusedOperator(
    spaceAgg,
    spaceDataType,
    spaceOperators,
    spaceAggField.onChange,
    null,
  );

  // The control only makes sense once the target can match more than one
  // device; a value left over from a wider target the picker has since
  // narrowed back down would be silently ignored otherwise.
  useEffect(() => {
    if (!canMatchMultipleDevices && spaceAgg) spaceAggField.onChange(null);
  }, [canMatchMultipleDevices, spaceAgg, spaceAggField]);

  return (
    <>
      <AttributeTargetPicker
        value={target}
        onChange={targetField.onChange}
        devices={devices}
      />
      <Tabs
        value={isPeriod ? "period" : "live"}
        onValueChange={(v) =>
          temporalField.onChange(v === "period" ? {} : "live")
        }
      >
        <TabsList>
          <TabsTrigger value="live">
            {t("widgets.kpi.temporal.live")}
          </TabsTrigger>
          <TabsTrigger value="period">
            {t("widgets.kpi.temporal.period")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="period" className="mt-4">
          <SelectController<FieldValues, "config.temporal.operator", string>
            name="config.temporal.operator"
            control={control}
            label={t("widgets.kpi.operator.label")}
            placeholder={t("widgets.kpi.operator.placeholder")}
            options={operatorOptions}
          />
        </TabsContent>
      </Tabs>
      {showSpaceControl && (
        <SelectController<FieldValues, "config.space_agg", string>
          name="config.space_agg"
          control={control}
          label={t("widgets.kpi.space.label")}
          description={t("widgets.kpi.space.description")}
          placeholder={t("widgets.kpi.space.placeholder")}
          options={spaceOperatorOptions}
        />
      )}
      {targetInvalid && (
        <p className="text-sm text-destructive">
          {t("widgets.kpi.singleDeviceRequired")}
        </p>
      )}
      <InputController
        name="config.unit"
        control={control}
        label={t("widgets.kpi.unit.label")}
      />
      <InputController
        name="config.precision"
        control={control}
        type="number"
        label={t("widgets.kpi.precision.label")}
        inputProps={{ min: 0, step: 1 }}
      />
    </>
  );
};
