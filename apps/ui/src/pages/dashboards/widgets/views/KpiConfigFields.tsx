import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
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
  DevicesFilterTabs,
  useAttributeCoverage,
  useSkippedDeviceCount,
  type AttributeTarget,
  type TargetPickerMode,
} from "@/components/forms/targetPicker";
import { Button } from "@/components/ui";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AggOption } from "@/hooks/AggOption";
import {
  operatorsFor,
  operatorsForAll,
  spaceOperatorsFor,
  useAggregateOptions,
  useResetRefusedOperator,
} from "@/hooks/useAggregateOptions";
import { useDevicesList } from "@/hooks/useDevicesList";
import { attributeUnit } from "@/lib/attributeUnits";
import { isEmptyFilter } from "@/lib/devices";

type Temporal = "live" | { operator?: AggregationOperator };
type KpiDevices = AttributeTarget["devices"];

/** A single explicit device id, no other criteria: the set resolves to
 *  exactly one device on its own, no fold operator needed. */
function hasSingleDeviceCriterion(devices: KpiDevices): boolean {
  const hasTags = !!devices.tags && Object.keys(devices.tags).length > 0;
  return (devices.ids?.length ?? 0) === 1 && !devices.types && !hasTags;
}

/** The tabs need a well-formed filter to render; the schema-driven default
 *  for an object property is `""`, which is what a new widget starts from. */
function toDevicesFilter(value: unknown): KpiDevices {
  if (typeof value !== "object" || value === null) return {};
  const { ids, types, tags } = value as KpiDevices;
  return { ids, types, tags };
}

/** What a freshly-added attribute row starts from — the shared device set
 *  lives at the tile level, so a new row only needs its own label/attribute. */
export const BLANK_ATTRIBUTE = {
  label: "",
  attribute: "",
  space_agg: null,
  unit: null,
  precision: null,
};

/** The tile's live-preview footprint while composing attributes, mirroring
 *  the backend's `KpiWidgetConfig.content_size_hint` (the source of truth,
 *  applied for real on save) — kept next to the rest of this type's editor
 *  code so the generic editor stays type-agnostic (see registry.tsx). */
export function kpiPreviewSize(
  config: Record<string, unknown> | undefined,
  baseSize: { w: number; h: number },
): { w: number; h: number } {
  const attributes = config?.attributes;
  if (!Array.isArray(attributes)) return baseSize;
  return { w: baseSize.w, h: Math.max(baseSize.h, attributes.length) };
}

/**
 * What the widget's JSON Schema cannot say about a KPI config: the shared
 * device set must select something, and once it can match more than one
 * device, every attribute needs a fold operator to still show one number —
 * a single explicit id needs none, it already resolves to one.
 */
export const kpiConfigCheck = z
  .looseObject({
    devices: z.looseObject({}),
    attributes: z.array(z.looseObject({ space_agg: z.unknown().optional() })),
  })
  .refine(
    (config) => {
      const devices = toDevicesFilter(config.devices);
      if (hasSingleDeviceCriterion(devices)) return true;
      return (
        !isEmptyFilter(devices) && config.attributes.every((a) => !!a.space_agg)
      );
    },
    { path: ["devices"] },
  );

/**
 * Config fields for the KPI widget: one shared device set, then one or more
 * attributes over it, sharing whether the tile shows current values or ones
 * reduced over the dashboard period.
 */
export const KpiConfigFields: FC<{ control: Control<FieldValues> }> = ({
  control,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
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
  // Read from its own registered path, not `temporal.operator`: the operator
  // select below registers "config.temporal.operator" as its own RHF field,
  // separate from this component's "config.temporal" controller, so the
  // parent controller's `value` never reflects a pick made through it.
  const watchedOperator = useWatch({
    control,
    name: "config.temporal.operator",
  }) as AggregationOperator | undefined;
  const operator = isPeriod ? (watchedOperator ?? null) : null;

  const { data: options } = useAggregateOptions();

  const { field: devicesField } = useController({
    control,
    name: "config.devices",
  });
  const devices = toDevicesFilter(devicesField.value);
  const [mode, setMode] = useState<TargetPickerMode>(
    devices.types?.length || Object.keys(devices.tags ?? {}).length
      ? "filters"
      : "devices",
  );
  const { devices: pickableDevices } = useDevicesList();

  // One coverage query for the whole tile — every attribute reads the same
  // shared device set, so this single response carries every row's data type.
  const { coverage } = useAttributeCoverage(devices, {
    enabled: !isEmptyFilter(devices),
  });
  const dataTypeOf = (attribute: string | undefined): DataType | undefined => {
    const dataTypes = coverage.find(
      (c) => c.attribute === attribute,
    )?.data_types;
    return dataTypes?.length === 1 ? dataTypes[0] : undefined;
  };

  const canMatchMultipleDevices =
    !isEmptyFilter(devices) && !hasSingleDeviceCriterion(devices);

  // The period operator is tile-level (every attribute shares one temporal
  // mode), so only an operator every attribute's data type accepts can be
  // offered — otherwise an attribute this excludes could be saved with an
  // operator its type refuses.
  const attributesValue = useWatch({ control, name: "config.attributes" }) as
    | { attribute?: string }[]
    | undefined;
  const dataTypes = (attributesValue ?? []).map((a) =>
    dataTypeOf(a?.attribute),
  );
  const operators = operatorsForAll(options, dataTypes);
  const operatorOptions = operators.map(({ operator: op, resultType }) => ({
    value: op as string,
    label: <AggOption name={op} resultType={resultType} />,
    disabled: resultType === null,
  }));

  // Waits for every attribute's data type — until all are known, "unsupported"
  // cannot be told from "not loaded yet".
  const allDataTypesKnown =
    dataTypes.length > 0 && dataTypes.every((dt) => dt !== undefined);
  const operatorRefused =
    !!operator &&
    allDataTypesKnown &&
    operators.some((o) => o.operator === operator && o.resultType === null);
  useEffect(() => {
    if (operatorRefused) temporalField.onChange({});
  }, [operatorRefused, temporalField]);

  // Switching to Live discards the period operator (it has no meaning
  // there), so it has to be remembered outside form state to survive a
  // round trip back to Period — otherwise every re-entry starts blank.
  const lastOperatorRef = useRef<AggregationOperator | undefined>(undefined);
  if (operator) lastOperatorRef.current = operator;

  const temporalControl = (
    <Tabs
      value={isPeriod ? "period" : "live"}
      onValueChange={(v) => {
        temporalField.onChange(
          v === "period"
            ? lastOperatorRef.current
              ? { operator: lastOperatorRef.current }
              : {}
            : "live",
        );
      }}
    >
      <TabsList>
        <TabsTrigger value="live">{t("widgets.kpi.temporal.live")}</TabsTrigger>
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
  );

  return (
    <>
      <div className="space-y-4 rounded-md border p-4">
        <DevicesFilterTabs
          devices={pickableDevices}
          mode={mode}
          onModeChange={setMode}
          deviceIds={devices.ids ?? []}
          onDeviceIdsChange={(ids) => devicesField.onChange({ ids })}
          typesFilter={devices.types}
          onTypesFilterChange={(types) =>
            devicesField.onChange({ types, tags: devices.tags })
          }
          tagsFilter={devices.tags}
          onTagsFilterChange={(tags) =>
            devicesField.onChange({ types: devices.types, tags })
          }
        />
      </div>

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
            devices={devices}
            dataTypeOf={dataTypeOf}
            isPeriod={isPeriod}
            operator={operator}
            canMatchMultipleDevices={canMatchMultipleDevices}
            temporalControl={index === 0 ? temporalControl : undefined}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => append(BLANK_ATTRIBUTE)}
      >
        <Plus className="mr-1 h-4 w-4" />
        {t("widgets.kpi.attribute.add")}
      </Button>
    </>
  );
};

/** One attribute row: label, attribute (over the tile's shared device set),
 *  fold operator, unit, precision. */
const KpiAttributeFields: FC<{
  control: Control<FieldValues>;
  index: number;
  devices: KpiDevices;
  dataTypeOf: (attribute: string | undefined) => DataType | undefined;
  isPeriod: boolean;
  operator: AggregationOperator | null;
  canMatchMultipleDevices: boolean;
  /** The Live/Period control; only passed for row 0. */
  temporalControl: ReactNode | undefined;
}> = ({
  control,
  index,
  devices,
  dataTypeOf,
  isPeriod,
  operator,
  canMatchMultipleDevices,
  temporalControl,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const name = `config.attributes.${index}`;
  const { field: attributeField } = useController({
    control,
    name: `${name}.attribute`,
  });
  const { field: spaceAggField } = useController({
    control,
    name: `${name}.space_agg`,
  });
  const { field: unitField } = useController({
    control,
    name: `${name}.unit`,
  });

  const attribute = (attributeField.value as string) || undefined;
  const spaceAgg = (spaceAggField.value as string | null) ?? null;

  const { data: options } = useAggregateOptions();

  const dataType = dataTypeOf(attribute);
  const { skipped, totalDevices } = useSkippedDeviceCount(devices, attribute);

  // Space runs on what the period operator yields, or directly on the raw
  // type for a live reading — there is no time reduction to chain through.
  // In period mode there is nothing to fold against until an operator is
  // picked, so the control waits for one — same as the chart widget's.
  const spaceDataType = isPeriod
    ? (operatorsFor(options, dataType).find((o) => o.operator === operator)
        ?.resultType ?? undefined)
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

  // The control only makes sense once the shared device set can match more
  // than one device; a value left over from a wider set the picker has since
  // narrowed back down would be silently ignored otherwise.
  useEffect(() => {
    if (!canMatchMultipleDevices && spaceAgg) spaceAggField.onChange(null);
  }, [canMatchMultipleDevices, spaceAgg, spaceAggField.onChange]);

  return (
    <>
      <InputController
        name={`${name}.label`}
        control={control}
        label={t("widgets.kpi.attributeLabel.label")}
      />
      <AttributeCoverageSelect
        filter={devices}
        value={attribute}
        onChange={(attr) => {
          attributeField.onChange(attr);
          // Prefill from the heuristic, but only into an untouched field —
          // this is a default, not a value the picker is allowed to clobber.
          if (attr && !unitField.value) {
            const resolvedUnit = attributeUnit(attr);
            if (resolvedUnit) unitField.onChange(resolvedUnit);
          }
        }}
      />
      {skipped > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          {t("common:pickers.attribute.skippedWarning", {
            count: skipped,
            total: totalDevices,
          })}
        </p>
      )}
      {temporalControl}
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
