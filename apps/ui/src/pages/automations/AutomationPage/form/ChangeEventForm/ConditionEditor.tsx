import { FC, useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { AttributeValue } from "@/components/AttributeValue";
import type { DeviceType } from "@/lib/devices";

export type ConditionOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "ne";
export type Threshold = number | string | boolean;
export type Condition = {
  operator: ConditionOperator;
  threshold: Threshold;
};

const ALL_OPERATORS: ConditionOperator[] = [
  "gt",
  "lt",
  "gte",
  "lte",
  "eq",
  "ne",
];
/** Equality only: ordering "heat" against "cool" has no meaning. Applies to
 *  booleans and to attributes whose driver publishes a value list. */
const EQUALITY_OPERATORS: ConditionOperator[] = ["eq", "ne"];

interface ConditionEditorProps {
  value: Condition | null;
  onChange: (next: Condition) => void;
  /** Data type of the watched attribute. Drives the threshold input shape and
   *  the available operators. The editor renders nothing until the parent has
   *  seeded `value` with a non-null Condition for the resolved dataType. */
  dataType: string | undefined;
  /** The driver's value list for the watched attribute, when it publishes one
   *  (e.g. thermostat mode, fan speed). Turns the threshold into a picker. */
  valueOptions?: Threshold[];
  /** Watched attribute name and the device's type — together they label enum
   *  values with the same icon + wording as everywhere else. */
  attributeName?: string;
  deviceType?: DeviceType;
  disabled?: boolean;
}

export const ConditionEditor: FC<ConditionEditorProps> = ({
  value,
  onChange,
  dataType,
  valueOptions,
  attributeName,
  deviceType,
  disabled,
}) => {
  const { t } = useTranslation("automations");
  const operatorId = useId();
  const thresholdId = useId();

  if (!dataType || !value) return null;

  const operators = operatorsFor(dataType, valueOptions);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
      <FieldShell id={operatorId} label={t("triggers.operator")} required>
        <Select
          value={value.operator}
          onValueChange={(v) =>
            onChange({ ...value, operator: v as ConditionOperator })
          }
          disabled={disabled}
        >
          <SelectTrigger id={operatorId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op} value={op}>
                <span>{t(`operators.${op}`, { defaultValue: op })}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>

      <FieldShell id={thresholdId} label={t("triggers.threshold")} required>
        <ThresholdInput
          id={thresholdId}
          value={value.threshold}
          onChange={(threshold) => onChange({ ...value, threshold })}
          dataType={dataType}
          valueOptions={valueOptions}
          attributeName={attributeName}
          deviceType={deviceType}
          disabled={disabled}
        />
      </FieldShell>
    </div>
  );
};

export function operatorsFor(
  dataType: string | undefined,
  valueOptions?: Threshold[],
): ConditionOperator[] {
  if (dataType === "bool" || (valueOptions && valueOptions.length > 0)) {
    return EQUALITY_OPERATORS;
  }
  return ALL_OPERATORS;
}

export function defaultThreshold(
  dataType: string | undefined,
  valueOptions?: Threshold[],
): Threshold {
  if (valueOptions && valueOptions.length > 0) return valueOptions[0];
  switch (dataType) {
    case "bool":
      return false;
    case "int":
    case "float":
      return 0;
    default:
      return "";
  }
}

export function defaultConditionFor(
  dataType: string,
  valueOptions?: Threshold[],
): Condition {
  return {
    operator: operatorsFor(dataType, valueOptions)[0] ?? "eq",
    threshold: defaultThreshold(dataType, valueOptions),
  };
}

interface ThresholdInputProps {
  id: string;
  value: Threshold;
  onChange: (value: Threshold) => void;
  dataType: string;
  valueOptions?: Threshold[];
  attributeName?: string;
  deviceType?: DeviceType;
  disabled?: boolean;
}

const ThresholdInput: FC<ThresholdInputProps> = ({
  id,
  value,
  onChange,
  dataType,
  valueOptions,
  attributeName,
  deviceType,
  disabled,
}) => {
  const { t } = useTranslation("common");

  // A driver-published value list beats the data type: users pick from what
  // the device accepts instead of guessing the spelling of "heat".
  if (valueOptions && valueOptions.length > 0) {
    return (
      <Select
        value={String(value)}
        onValueChange={(v) =>
          onChange(valueOptions.find((opt) => String(opt) === v) ?? v)
        }
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {valueOptions.map((opt) => (
            <SelectItem key={String(opt)} value={String(opt)}>
              <AttributeValue
                value={opt}
                attributeName={attributeName ?? ""}
                deviceType={deviceType}
                dataType={dataType}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (dataType === "bool") {
    return (
      <Select
        value={value === true ? "true" : "false"}
        onValueChange={(v) => onChange(v === "true")}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t("common.true")}</SelectItem>
          <SelectItem value="false">{t("common.false")}</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (dataType === "int" || dataType === "float") {
    return (
      <Input
        id={id}
        type="number"
        step={dataType === "int" ? 1 : "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") return onChange(0);
          const n = e.currentTarget.valueAsNumber;
          onChange(Number.isNaN(n) ? 0 : n);
        }}
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      id={id}
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
    />
  );
};

export default ConditionEditor;
