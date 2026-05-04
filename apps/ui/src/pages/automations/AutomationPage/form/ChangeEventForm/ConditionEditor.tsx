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
const BOOL_OPERATORS: ConditionOperator[] = ["eq", "ne"];

interface ConditionEditorProps {
  value: Condition | null;
  onChange: (next: Condition) => void;
  /** Data type of the watched attribute. Drives the threshold input shape and
   *  the available operators. The editor renders nothing until the parent has
   *  seeded `value` with a non-null Condition for the resolved dataType. */
  dataType: string | undefined;
  disabled?: boolean;
}

export const ConditionEditor: FC<ConditionEditorProps> = ({
  value,
  onChange,
  dataType,
  disabled,
}) => {
  const { t } = useTranslation("automations");
  const operatorId = useId();
  const thresholdId = useId();

  if (!dataType || !value) return null;

  const operators = operatorsFor(dataType);

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
                <span className="font-mono">
                  {t(`operators.${op}`, { defaultValue: op })}
                </span>
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
          disabled={disabled}
        />
      </FieldShell>
    </div>
  );
};

export function operatorsFor(
  dataType: string | undefined,
): ConditionOperator[] {
  return dataType === "bool" ? BOOL_OPERATORS : ALL_OPERATORS;
}

export function defaultThreshold(dataType: string | undefined): Threshold {
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

export function defaultConditionFor(dataType: string): Condition {
  return {
    operator: operatorsFor(dataType)[0] ?? "eq",
    threshold: defaultThreshold(dataType),
  };
}

interface ThresholdInputProps {
  id: string;
  value: Threshold;
  onChange: (value: Threshold) => void;
  dataType: string;
  disabled?: boolean;
}

const ThresholdInput: FC<ThresholdInputProps> = ({
  id,
  value,
  onChange,
  dataType,
  disabled,
}) => {
  const { t } = useTranslation("common");

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
