import { useTranslation } from "react-i18next";
import {
  Controller,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toLabel } from "@/lib/textFormat";
import type { Device } from "@/api/devices";
import type { WizardFormValues, WritableAttribute } from "./types";

type CommandStepProps = {
  control: Control<WizardFormValues>;
  setValue: UseFormSetValue<WizardFormValues>;
  attributes: WritableAttribute[];
  selectedDevices: Device[];
  selectedAttribute: string | undefined;
  selectedDataType: WizardFormValues["attributeDataType"];
};

export function CommandStep({
  control,
  setValue,
  attributes,
  selectedDevices,
  selectedAttribute,
  selectedDataType,
}: CommandStepProps) {
  const { t } = useTranslation("devices");

  if (attributes.length === 0) {
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
      <Controller
        control={control}
        name="attribute"
        render={({ field }) => (
          <Field>
            <FieldLabel>{t("commands.attribute")}</FieldLabel>
            <Select
              value={field.value ?? ""}
              onValueChange={(v) => {
                field.onChange(v);
                const attr = attributes.find((a) => a.name === v);
                setValue("attributeDataType", attr?.dataType);
                // Pre-fill the value with the first selected device's current
                // value. Firing inside the user handler (not a useEffect) means
                // device polling can't overwrite edits the user makes after.
                setValue("value", currentValueFor(selectedDevices, v));
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t("commands.new.pickAttributePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {attributes.map((attr) => (
                  <SelectItem key={attr.name} value={attr.name}>
                    <span>{toLabel(attr.name)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({attr.dataType})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      {selectedAttribute && selectedDataType && (
        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <Field>
              <FieldLabel>{t("commands.value")}</FieldLabel>
              <ValueInput
                dataType={selectedDataType}
                value={field.value}
                onChange={field.onChange}
              />
              <FieldDescription>
                {t(`commands.new.valueHint.${selectedDataType}`, {
                  defaultValue: "",
                })}
              </FieldDescription>
            </Field>
          )}
        />
      )}
    </div>
  );
}

function currentValueFor(
  devices: Device[],
  attributeName: string,
): WizardFormValues["value"] {
  const first = devices[0];
  if (!first) return undefined;
  const attr = Object.values(first.attributes).find(
    (a) => a.name === attributeName,
  );
  const value = attr?.currentValue;
  if (value === null || value === undefined) return undefined;
  return value as WizardFormValues["value"];
}

type ValueInputProps = {
  dataType: NonNullable<WizardFormValues["attributeDataType"]>;
  value: WizardFormValues["value"];
  onChange: (v: WizardFormValues["value"]) => void;
};

function ValueInput({ dataType, value, onChange }: ValueInputProps) {
  if (dataType === "bool") {
    return <BoolInput value={value} onChange={onChange} />;
  }
  if (dataType === "int" || dataType === "float") {
    return (
      <Input
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
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function BoolInput({
  value,
  onChange,
}: {
  value: WizardFormValues["value"];
  onChange: (v: WizardFormValues["value"]) => void;
}) {
  const { t } = useTranslation("devices");
  const isOn = value === true;
  const isOff = value === false;
  return (
    <div className="inline-flex items-center gap-3">
      <span
        className={cn(
          "text-sm",
          isOff ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {t("commands.new.off")}
      </span>
      <Switch checked={isOn} onCheckedChange={onChange} />
      <span
        className={cn(
          "text-sm",
          isOn ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {t("commands.new.on")}
      </span>
    </div>
  );
}
