import { useEffect, useMemo, type FC } from "react";
import type { AggregationOperator, DataType } from "@gridone/sdk";
import {
  useController,
  useFieldArray,
  useWatch,
  type Control,
  type FieldValues,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import * as z from "zod";
import {
  AttributeCoverageSelect,
  AttributeTargetPicker,
  useAttributeCoverage,
  type AttributeTarget,
} from "@/components/forms/targetPicker";
import { Button } from "@/components/ui";
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

/** What a freshly-added attribute row starts from. */
export const BLANK_ATTRIBUTE = {
  target: { devices: {}, attribute: "" },
  space_agg: null,
  unit: null,
  precision: null,
};

const kpiAttributeCheck = z
  .looseObject({
    target: z.looseObject({
      devices: z.custom<AttributeTarget["devices"]>(),
    }),
    space_agg: z.unknown().optional(),
  })
  .refine(
    (attribute) => {
      const devices = attribute.target.devices;
      // A criteria target (type/tags, or several ids) can match more than
      // one device, so it needs a fold operator to still show one number —
      // the same collapse-all semantics as the chart widget's space_agg.
      if (hasSingleDeviceCriterion(devices)) return true;
      return !isEmptyTarget(devices) && !!attribute.space_agg;
    },
    { path: ["target", "devices"] },
  );

export const kpiConfigCheck = z.looseObject({
  attributes: z.array(kpiAttributeCheck),
});

/** The attribute's data type, once its target resolves to exactly one —
 *  shared by the tile-level operator list (which goes by the first
 *  attribute) and each row's own space-operator list. */
function useAttributeDataType(target: AttributeTarget): DataType | undefined {
  const { coverage } = useAttributeCoverage(target.devices, {
    enabled: !isEmptyFilter(target.devices),
  });
  const dataTypes = coverage.find(
    (c) => c.attribute === target.attribute,
  )?.data_types;
  return dataTypes?.length === 1 ? dataTypes[0] : undefined;
}

/**
 * Config fields for the KPI widget: one or more device+attribute picks,
 * sharing whether the tile shows current values or ones reduced over the
 * dashboard period.
 */
export const KpiConfigFields: FC<{ control: Control<FieldValues> }> = ({
  control,
}) => {
  const { t } = useTranslation("dashboards");
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "config.attributes",
  });

  // The generic empty-config builder has no notion of "array with one blank
  // row", so a freshly-added widget (or a schema default of `""`) starts
  // with none — always keep at least one so there is something to edit.
  useEffect(() => {
    if (fields.length === 0) replace([BLANK_ATTRIBUTE]);
  }, [fields.length, replace]);

  const { field: temporalField } = useController({
    control,
    name: "config.temporal",
  });

  const temporal = temporalField.value as Temporal | undefined;
  const isPeriod = typeof temporal === "object" && temporal !== null;
  const operator = isPeriod ? (temporal.operator ?? null) : null;

  const { data: options } = useAggregateOptions();

  // The period operator is tile-level (every attribute shares one temporal
  // mode), so its enabled/disabled list goes by the first attribute's data
  // type — a representative choice; dtype compatibility is enforced per
  // attribute at read time regardless of what's shown enabled here.
  const firstTargetValue = useWatch({
    control,
    name: "config.attributes.0.target",
  });
  const firstTarget = toPickerTarget(firstTargetValue);
  const firstDataType = useAttributeDataType(firstTarget);

  // A new attribute is almost always another metric of the same device set,
  // so it starts from the last row's device selection — the user only has
  // to pick the attribute, not re-enter the target too.
  const attributesValue = useWatch({ control, name: "config.attributes" }) as
    | { target?: { devices?: AttributeTarget["devices"] } }[]
    | undefined;
  const appendAttribute = () => {
    const devices = attributesValue?.at(-1)?.target?.devices;
    append({
      ...BLANK_ATTRIBUTE,
      target: { ...BLANK_ATTRIBUTE.target, devices: devices ?? {} },
    });
  };

  const operators = operatorsFor(options, firstDataType);
  const operatorOptions = useMemo(
    () =>
      operators.map(({ operator: op, resultType }) => ({
        value: op as string,
        label: <AggOption name={op} resultType={resultType} />,
        disabled: resultType === null,
      })),
    [operators],
  );

  useResetRefusedOperator(
    operator,
    firstDataType,
    operators,
    () => temporalField.onChange({}),
    undefined,
  );

  return (
    <>
      {fields.map((field, index) => (
        <div key={field.id} className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t("widgets.kpi.attribute.label", { index: index + 1 })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("widgets.kpi.attribute.remove")}
              disabled={fields.length === 1}
              onClick={() => remove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <KpiAttributeFields
            control={control}
            index={index}
            isPeriod={isPeriod}
            operator={operator}
            sharedDevices={index === 0 ? undefined : firstTarget.devices}
          />
        </div>
      ))}

      <Button type="button" variant="outline" onClick={appendAttribute}>
        <Plus className="mr-1 h-4 w-4" />
        {t("widgets.kpi.attribute.add")}
      </Button>

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
    </>
  );
};

/** One attribute row: which device+attribute, its fold operator (once its
 *  target can match more than one device), unit and precision.
 *
 *  `sharedDevices` is set for every row but the first: this tile's device
 *  set is picked once, on row 0, and the rest only choose which attribute
 *  of that same set to add — showing the device picker again per row would
 *  invite a device set that differs from row 0's, which the UX intentionally
 *  doesn't offer (see AGR-1057: "several related metrics for the same
 *  device or device set"). */
const KpiAttributeFields: FC<{
  control: Control<FieldValues>;
  index: number;
  isPeriod: boolean;
  operator: AggregationOperator | null;
  sharedDevices: AttributeTarget["devices"] | undefined;
}> = ({ control, index, isPeriod, operator, sharedDevices }) => {
  const { t } = useTranslation("dashboards");
  const name = `config.attributes.${index}`;
  const { field: targetField } = useController({
    control,
    name: `${name}.target`,
  });
  const { field: spaceAggField } = useController({
    control,
    name: `${name}.space_agg`,
  });

  const target = toPickerTarget(targetField.value);
  const spaceAgg = (spaceAggField.value as string | null) ?? null;

  const { devices } = useDevicesList();
  const { data: options } = useAggregateOptions();

  // Keep this row's stored devices mirroring row 0's, so a later change
  // there (the only place it's editable) still reaches every row's target.
  useEffect(() => {
    if (!sharedDevices) return;
    if (JSON.stringify(target.devices) === JSON.stringify(sharedDevices)) {
      return;
    }
    targetField.onChange({ ...targetField.value, devices: sharedDevices });
  }, [sharedDevices, target.devices, targetField]);

  const dataType = useAttributeDataType(target);
  const operators = operatorsFor(options, dataType);

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
  const spaceOperatorOptions = useMemo(
    () =>
      spaceOperators.map(({ operator: op, resultType }) => ({
        value: op as string,
        label: <AggOption name={op} resultType={resultType} kind="space" />,
        disabled: resultType === null,
      })),
    [spaceOperators],
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
  }, [canMatchMultipleDevices, spaceAgg, spaceAggField.onChange]);

  return (
    <>
      {sharedDevices ? (
        <AttributeCoverageSelect
          filter={sharedDevices}
          value={target.attribute}
          onChange={(attribute) =>
            targetField.onChange({ ...targetField.value, attribute })
          }
        />
      ) : (
        <AttributeTargetPicker
          value={target}
          onChange={targetField.onChange}
          devices={devices}
        />
      )}
      {showSpaceControl && (
        <SelectController<FieldValues, `${string}.space_agg`, string>
          name={`${name}.space_agg`}
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
        name={`${name}.unit`}
        control={control}
        label={t("widgets.kpi.unit.label")}
      />
      <InputController
        name={`${name}.precision`}
        control={control}
        type="number"
        label={t("widgets.kpi.precision.label")}
        inputProps={{ min: 0, step: 1 }}
      />
    </>
  );
};
