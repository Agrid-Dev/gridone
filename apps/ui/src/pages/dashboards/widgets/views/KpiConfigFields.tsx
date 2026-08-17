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
import { operatorsFor, useAggregateOptions } from "@/hooks/useAggregateOptions";
import { useDevicesList } from "@/hooks/useDevicesList";
import { isEmptyFilter } from "@/lib/devices";
import { AggOption, toPickerTarget } from "./ChartConfigFields";

type Temporal = "live" | { operator?: AggregationOperator };

/** v0 KPI tiles show one device's value: exactly one explicit id, no
 *  criteria filter — unlike the chart target, which fans out over a set. */
function hasSingleDeviceCriterion(devices: unknown): boolean {
  if (typeof devices !== "object" || devices === null) return false;
  const { ids, types } = devices as Record<string, unknown>;
  return Array.isArray(ids) && ids.length === 1 && !types;
}

export const kpiConfigCheck = z.looseObject({
  target: z.looseObject({
    devices: z.custom<AttributeTarget["devices"]>(hasSingleDeviceCriterion),
  }),
});

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

  const target = toPickerTarget(targetField.value);
  const temporal = temporalField.value as Temporal | undefined;
  const isPeriod = typeof temporal === "object" && temporal !== null;
  const operator = isPeriod ? (temporal.operator ?? null) : null;

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

  const refused =
    !!operator &&
    !!dataType &&
    operators.some((o) => o.operator === operator && o.resultType === null);

  useEffect(() => {
    if (refused) operatorField.onChange(undefined);
  }, [refused, operatorField]);

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
