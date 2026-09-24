import { AttributeDependencies } from "@/components/AttributeDependencies";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { commandReasons } from "@/lib/commandReasons";
import { useTranslation } from "react-i18next";
import {
  Controller,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SelectController } from "@/components/forms/controllers/SelectController";
import {
  AttributeCoverageSelect,
  useAttributeCoverage,
} from "@/components/forms/targetPicker";
import { AttributeValue } from "@/components/AttributeValue";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import type {
  AttributeCoverage,
  AttributeWriteState,
  Device,
} from "@gridone/sdk";
import {
  deviceAttributes,
  isEmptyFilter,
  type DevicesFilter,
  type DeviceType,
} from "@/lib/devices";
import { useBooleanField } from "./booleanField";
import { currentValueFor } from "./resolvers";
import type { WizardFormValues } from "./types";

type CommandStepProps = {
  control: Control<WizardFormValues>;
  setValue: UseFormSetValue<WizardFormValues>;
  /** The effective device-set filter the attribute coverage is computed
   *  over (explicit ids, or the filters-mode criteria). */
  filter: DevicesFilter;
  selectedDevices: Device[];
  selectedAttribute: string | undefined;
  selectedDataType: WizardFormValues["attributeDataType"];
  /** Coverage row of the selected attribute, looked up once by the wizard. */
  selectedCoverage: AttributeCoverage | undefined;
};

export function CommandStep({
  control,
  setValue,
  filter,
  selectedDevices,
  selectedAttribute,
  selectedDataType,
  selectedCoverage,
}: CommandStepProps) {
  const { t } = useTranslation("devices");
  const booleanField = useBooleanField();
  const labelFor = useAttributeLabel();

  // Same query key as the wizard's and AttributeCoverageSelect's hook —
  // react-query dedupes, so this costs no extra fetch.
  const { coverage, isLoading } = useAttributeCoverage(filter, {
    enabled: !isEmptyFilter(filter),
  });
  const hasWritable = coverage.some((c) => c.writable_count > 0);

  if (!isLoading && !hasWritable) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("commands.new.noCompatibleTitle")}</AlertTitle>
        <AlertDescription>
          {t("commands.new.noCompatibleDescription")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {selectedDevices.length === 1 &&
        selectedAttribute &&
        (() => {
          const device = selectedDevices[0];
          const attributes = deviceAttributes(device);
          const state = attributes[selectedAttribute]?.write_state as
            | AttributeWriteState
            | undefined;
          return state?.missing_dependencies ? (
            <AttributeDependencies
              deviceId={device.id}
              attribute={selectedAttribute}
              labels={(state.missing_attributes ?? []).map((name) =>
                labelFor(name, attributes[name]),
              )}
            />
          ) : null;
        })()}
      <Controller
        control={control}
        name="attribute"
        render={({ field }) => (
          <Field>
            <FieldLabel>{t("commands.attribute")}</FieldLabel>
            <AttributeCoverageSelect
              filter={filter}
              writableOnly
              value={field.value}
              onChange={(attribute, dataType) => {
                field.onChange(attribute);
                setValue("attributeDataType", dataType);
                // Pre-fill only when the writable devices agree. Firing inside the user handler (not a useEffect) means
                // device polling can't overwrite edits the user makes after.
                setValue("value", currentValueFor(selectedDevices, attribute));
              }}
            />
          </Field>
        )}
      />

      {selectedAttribute &&
        selectedDataType &&
        (() => {
          const projectedOptions = selectedCoverage?.write_state?.options;
          const selectedValueOptions =
            projectedOptions?.map((option) => option.value) ??
            selectedCoverage?.value_options;
          const hint = t(`commands.new.valueHint.${selectedDataType}`, {
            defaultValue: "",
          });

          if (
            selectedDataType !== "bool" &&
            selectedValueOptions &&
            selectedValueOptions.length > 0
          ) {
            const deviceTypes = [
              ...new Set(selectedDevices.map((d) => d.type).filter(Boolean)),
            ] as DeviceType[];
            return (
              <SelectController
                control={control}
                name="value"
                label={t("commands.value")}
                description={hint || undefined}
                options={selectedValueOptions.map((opt) => ({
                  value: opt,
                  disabled:
                    projectedOptions?.find((option) => option.value === opt)
                      ?.available === false,
                  reason: commandReasons(
                    projectedOptions?.find((option) => option.value === opt)
                      ?.reasons,
                  ),
                  label: (
                    <AttributeValue
                      deviceType={deviceTypes}
                      attributeName={selectedAttribute}
                      value={opt}
                    />
                  ),
                }))}
              />
            );
          }

          if (selectedDataType === "bool") {
            const field = booleanField(
              selectedCoverage?.value_labels,
              projectedOptions,
            );
            return field.kind === "switch" ? (
              <SwitchController
                control={control}
                name="value"
                label={t("commands.value")}
                description={hint || undefined}
                sides={field.sides}
              />
            ) : (
              <SelectController
                control={control}
                name="value"
                label={t("commands.value")}
                description={hint || undefined}
                options={field.options}
              />
            );
          }

          return (
            <Controller
              control={control}
              name="value"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="command-value">
                    {t("commands.value")}
                  </FieldLabel>
                  <ValueInput
                    id="command-value"
                    dataType={selectedDataType}
                    value={field.value}
                    onChange={field.onChange}
                  />
                  {hint && <FieldDescription>{hint}</FieldDescription>}
                </Field>
              )}
            />
          );
        })()}
    </div>
  );
}

type ValueInputProps = {
  /** Booleans are handled by the switch controller above, not here. */
  dataType: Exclude<NonNullable<WizardFormValues["attributeDataType"]>, "bool">;
  value: WizardFormValues["value"];
  onChange: (v: WizardFormValues["value"]) => void;
  id: string;
};

function ValueInput({ dataType, value, onChange, id }: ValueInputProps) {
  if (dataType === "int" || dataType === "float") {
    return (
      <Input
        id={id}
        type="number"
        step={dataType === "int" ? 1 : "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") return onChange(undefined);
          const n = e.currentTarget.valueAsNumber;
          onChange(Number.isNaN(n) ? undefined : n);
        }}
      />
    );
  }
  return (
    <Input
      id={id}
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}
