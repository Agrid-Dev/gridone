import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { AttributeCoverage, Device } from "@gridone/sdk";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttributeCoverageSelect } from "@/components/forms/targetPicker";
import type { AttributeValue, DevicesFilter } from "@/lib/devices";
import {
  currentRange,
  currentValues,
  inputBounds,
  type CommandValues,
} from "./groupedCommand";

type Props = {
  form: UseFormReturn<CommandValues>;
  /** Device set the attribute select offers attributes from. */
  filter: DevicesFilter;
  attribute: string;
  /** Coverage of *attribute* over the selection: data type, unit, options and
   *  bounds, already unified over the devices that can be written to. */
  coverage: AttributeCoverage | undefined;
  /** Selected devices that will receive the command — the reported values the
   *  range hint is drawn from. */
  eligible: Device[];
  hasSelection: boolean;
  disabled: boolean;
  /** No coverage row for a chosen attribute: it is not on the selection. */
  unavailable: boolean;
  onAttributeChange: (attribute: string) => void;
  onValueChange: (value: AttributeValue | undefined) => void;
};

export function GroupedCommandFields({
  form,
  filter,
  attribute,
  coverage,
  eligible,
  hasSelection,
  disabled,
  unavailable,
  onAttributeChange,
  onValueChange,
}: Props) {
  const { t } = useTranslation("devices");
  const bounds = inputBounds(coverage);
  const dataType = coverage?.data_types[0];
  const options = coverage?.value_options;
  const unit = coverage?.unit;
  const range = currentRange(eligible, attribute);
  const mixed = currentValues(eligible, attribute).length > 1;
  return (
    <div className="space-y-6">
      {!hasSelection && (
        <p className="text-sm text-muted-foreground">
          {t("commands.grouped.pickDevices")}
        </p>
      )}
      <Field>
        <FieldLabel htmlFor="command-attribute">
          {t("commands.attribute")}
        </FieldLabel>
        <AttributeCoverageSelect
          id="command-attribute"
          filter={filter}
          value={attribute}
          onChange={onAttributeChange}
          writableOnly
          disabled={disabled}
        />
        {unavailable && (
          <FieldDescription>
            {t("commands.grouped.unavailableAttribute")}
          </FieldDescription>
        )}
      </Field>
      {coverage && (
        <Controller
          control={form.control}
          name="value"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="command-value">
                {t("commands.value")}
                {unit ? ` (${unit})` : ""}
              </FieldLabel>
              {dataType === "bool" || !!options?.length ? (
                <Select
                  value={
                    field.value === undefined ? "" : JSON.stringify(field.value)
                  }
                  onValueChange={(value) => {
                    field.onChange(JSON.parse(value));
                    onValueChange(JSON.parse(value));
                  }}
                >
                  <SelectTrigger
                    id="command-value"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue
                      placeholder={t("commands.grouped.chooseValue")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(options?.length ? options : [false, true]).map(
                      (value) => (
                        <SelectItem
                          key={JSON.stringify(value)}
                          value={JSON.stringify(value)}
                        >
                          {typeof value === "boolean"
                            ? t(value ? "commands.new.on" : "commands.new.off")
                            : String(value)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  {...field}
                  id="command-value"
                  aria-invalid={fieldState.invalid}
                  className="max-w-xs"
                  type={dataType === "str" ? "text" : "number"}
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step ?? (dataType === "int" ? 1 : "any")}
                  value={
                    typeof field.value === "boolean" ? "" : (field.value ?? "")
                  }
                  onChange={(event) => {
                    const value =
                      dataType === "str"
                        ? event.currentTarget.value
                        : event.currentTarget.value === ""
                          ? undefined
                          : event.currentTarget.valueAsNumber;
                    field.onChange(value);
                    onValueChange(value);
                  }}
                />
              )}
              {mixed && (
                <FieldDescription>
                  {t("commands.grouped.currentRange", {
                    range,
                    unit: unit ?? "",
                  })}
                </FieldDescription>
              )}
              {fieldState.invalid && (
                <FieldError>{t("commands.grouped.invalidValue")}</FieldError>
              )}
            </Field>
          )}
        />
      )}
    </div>
  );
}
