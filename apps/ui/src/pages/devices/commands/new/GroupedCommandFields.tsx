import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
import { currentRange, currentValues, inputBounds } from "./groupedCommand";
import type { useGroupedCommand } from "./useGroupedCommand";

export function GroupedCommandFields({
  command,
}: {
  command: ReturnType<typeof useGroupedCommand>;
}) {
  const { t } = useTranslation("devices");
  const bounds = inputBounds(command.presentation);
  const dataType = command.row?.data_types[0];
  const options = command.presentation?.value_options;
  const unit = command.presentation?.unit;
  const range = currentRange(command.eligible, command.attribute);
  const mixed = currentValues(command.eligible, command.attribute).length > 1;
  return (
    <div className="space-y-6">
      {command.selected.length === 0 && (
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
          filter={command.selectedFilter}
          value={command.attribute}
          onChange={command.chooseAttribute}
          writableOnly
          disabled={
            command.isLoading ||
            !command.scopeExists ||
            command.selected.length === 0
          }
        />
        {!command.isLoading && !command.row && command.attribute && (
          <FieldDescription>
            {t("commands.grouped.unavailableAttribute")}
          </FieldDescription>
        )}
      </Field>
      {command.row && (
        <Controller
          control={command.form.control}
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
                    command.changeValue(JSON.parse(value));
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
                    command.changeValue(value);
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
